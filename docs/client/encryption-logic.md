# Encryption Logic (`encrypt.ts`)

This document explains the functionality of the `encrypt.ts` file, which is used to securely encrypt and decrypt sensitive strings (like GitHub Personal Access Tokens) before storing them in the database.

## Overview
The file uses Node.js's built-in `crypto` module to perform **AES-256-CBC** symmetric encryption. This means the same secret key is used for both encrypting and decrypting the data.

## Line-by-Line Explanation

### Setup and Configuration

```typescript
import crypto from 'crypto';
```
Imports the built-in Node.js `crypto` library, which provides cryptographic functionality like ciphers, hashes, and random number generation.

```typescript
const algortihm = "aes-256-cbc"
```
Defines the encryption algorithm. 
- **AES (Advanced Encryption Standard)** is an industry-standard encryption algorithm.
- **256** refers to the key size (256 bits or 32 bytes), providing a very high level of security.
- **CBC (Cipher Block Chaining)** is a mode of operation that mixes each block of text with the previous encrypted block, ensuring that identical plaintexts encrypt to different ciphertexts (when combined with a unique Initialization Vector).

```typescript
const key = process.env.ENCRYPTION_KEY!
```
Retrieves the secret encryption key from the environment variables. 
> [!IMPORTANT]
> The `ENCRYPTION_KEY` **must be exactly 32 bytes (64 hex characters) long** to work with `aes-256`. The `!` tells TypeScript we are confident this value exists and won't be undefined.

---

### The `encrypt` Function

```typescript
export function encrypt(text:string){
```
Exports the `encrypt` function, which takes a plain text string as input.

```typescript
    const iv=crypto.randomBytes(16)
```
Generates a random **Initialization Vector (IV)** of 16 bytes. The IV is crucial for CBC mode; it ensures that encrypting the same text multiple times will result in different encrypted outputs, protecting against pattern attacks. The IV does not need to be secret, but it *must* be unique for every encryption.

```typescript
    const cipher = crypto.createCipheriv(algortihm,Buffer.from(key),iv)
```
Creates the `Cipher` object using the defined algorithm, the secret key (converted to a Buffer), and the randomly generated IV.

```typescript
    const encrypted = Buffer.concat([cipher.update(text),cipher.final()])
```
Encrypts the actual text. 
- `cipher.update(text)` encrypts the main body of the text.
- `cipher.final()` finalizes the encryption and pads any remaining blocks.
- `Buffer.concat` merges the results into a single buffer.

```typescript
    return iv.toString("hex") + ":"+ encrypted.toString("hex")
}
```
Returns a single string containing both the IV and the encrypted text, separated by a colon (`:`). Both are converted to hexadecimal strings. *We must store the IV alongside the ciphertext because it is required for decryption.*

---

### The `decrypt` Function

```typescript
export function decrypt(text: string){
```
Exports the `decrypt` function, which takes the custom formatted string `(iv:encryptedText)` as input.

```typescript
    const [iVHex , encryptedHex ]= text.split(":")
```
Splits the input string at the colon (`:`) into two parts: the hexadecimal IV and the hexadecimal encrypted text.

```typescript
    const iv = Buffer.from(iVHex,"hex")
    const encryptedText = Buffer.from(encryptedHex , "hex")
```
Converts the hex strings back into raw binary Buffers, which is the format the `crypto` module expects.

```typescript
    const decipher = crypto.createDecipheriv(algortihm,Buffer.from(key),iv)
```
Creates the `Decipher` object using the same algorithm, the same secret key, and the exact same IV that was used during encryption.

```typescript
    const decrypted = Buffer.concat([
        decipher.update(encryptedText),
        decipher.final(),
    ])
```
Decrypts the data.
- `decipher.update(encryptedText)` processes the encrypted data buffer.
- `decipher.final()` finishes the decryption and removes padding.
- `Buffer.concat` combines the decrypted chunks back together.

```typescript
    return decrypted.toString()
}
```
Converts the fully decrypted binary buffer back into a readable UTF-8 string and returns it.
