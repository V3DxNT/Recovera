import crypto from 'crypto';

const algorithm = "aes-256-cbc"
const encryptionKey = process.env.ENCRYPTION_KEY;
if (!encryptionKey || encryptionKey.length !== 64) {
    throw new Error("ENCRYPTION_KEY environment variable must be a 64-character hex string (32 bytes).");
}
const key = Buffer.from(encryptionKey, "hex");

export function encrypt(text: string) {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(algorithm, key, iv)
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()])
    return iv.toString("hex") + ":" + encrypted.toString("hex")
}

export function decrypt(text: string) {
    const [ivHex, encryptedHex] = text.split(":")
    const iv = Buffer.from(ivHex, "hex")
    const encryptedText = Buffer.from(encryptedHex, "hex")

    const decipher = crypto.createDecipheriv(algorithm, key, iv)
    const decrypted = Buffer.concat([
        decipher.update(encryptedText),
        decipher.final(),
    ])

    return decrypted.toString()
}
