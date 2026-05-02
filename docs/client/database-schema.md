# Database Schema Documentation

This document explains the Prisma schema used for handling authentication (via NextAuth and GitHub) in the application. The schema defines three core models: `User`, `Account`, and `Session`.

---

## 1. User Model
The `User` model represents a physical person using the application. It acts as the central entity to which all other data (like OAuth accounts and active sessions) is linked.

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

### Fields Explained:
- **`id`**: A unique identifier automatically generated using `cuid()` (Collision Resistant Unique Identifier). It's secure, URL-safe, and scalable.
- **`name`**: The user's display name, fetched from their GitHub profile.
- **`email`**: The user's primary email address. It must be unique across the entire database.
- **`emailVerified`**: A timestamp indicating when the email was verified. *(Not strictly necessary for OAuth providers like GitHub, but required by NextAuth for compatibility).*
- **`image`**: A URL pointing to the user's avatar/profile picture from GitHub.
- **`accounts`**: A relation array pointing to the `Account` model. One user can have multiple linked OAuth accounts (e.g., GitHub, Google, Discord), though currently only GitHub is used.
- **`sessions`**: A relation array pointing to the `Session` model. One user can be logged in from multiple devices simultaneously.
- **`createdAt` / `updatedAt`**: Automatic timestamps tracking when the user profile was created and last modified.

---

## 2. Account Model
The `Account` model stores information about OAuth accounts (like GitHub) that are linked to a specific `User`. NextAuth uses this to manage the OAuth tokens required to make API requests on behalf of the user.

```prisma
model Account {
  id                 String  @id @default(cuid())
  userId             String
  type               String
  provider           String
  providerAccountId  String
  refresh_token      String?  @db.Text
  access_token       String?  @db.Text
  expires_at         Int?
  token_type         String?
  scope              String?
  id_token           String?  @db.Text
  session_state      String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}
```

### Fields Explained:
- **`id`**: Unique identifier for the account record.
- **`userId`**: A foreign key linking this OAuth account to a specific `User`.
- **`type`**: The type of OAuth provider (e.g., `oauth`, `oidc`).
- **`provider`**: The name of the service provider (e.g., `"github"`).
- **`providerAccountId`**: The unique ID GitHub assigned to this user in their system.
- **`access_token`**: The secret token used to make authenticated requests to the GitHub API on the user's behalf. Stored as `@db.Text` because tokens can be very long.
- **`refresh_token`**: A token used to get a new `access_token` when the old one expires.
- **`expires_at`**: Unix timestamp indicating when the `access_token` will expire.
- **`token_type` / `scope` / `id_token` / `session_state`**: Additional OAuth metadata returned by GitHub. 
- **`user` (relation)**: Links back to the `User`. `onDelete: Cascade` means if the user deletes their account, all their linked OAuth data is automatically deleted too.
- **`@@unique(...)`**: Ensures a specific GitHub account cannot be linked to more than one User in our database.

---

## 3. Session Model
The `Session` model is used by NextAuth to manage active database sessions. Every time a user logs in, a new session is created here.

```prisma
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### Fields Explained:
- **`id`**: Unique identifier for the session.
- **`sessionToken`**: A secure, randomly generated string that gets stored in the user's browser as a cookie. When the browser makes a request, it sends this token to prove they are logged in.
- **`userId`**: The foreign key indicating which `User` owns this session.
- **`expires`**: The date and time when this session becomes invalid (forcing the user to log in again). NextAuth manages rolling this expiration forward automatically.
- **`user` (relation)**: Links back to the `User`. `onDelete: Cascade` ensures that if a user is deleted, all their active login sessions are instantly destroyed.

---

## Why are all these tables needed?
If you only have GitHub login, you might wonder why we don't just put everything in the `User` table. 
1. **Security & Separation of Concerns**: The `User` table holds public/profile data, while `Account` securely isolates sensitive OAuth tokens (`access_token`). 
2. **Device Management**: The `Session` table allows a user to be logged in on their phone and laptop simultaneously, and logging out on one device won't affect the other.
3. **Future-Proofing**: This structure is NextAuth's industry standard. If you ever decide to add Google or Email login later, your database schema won't need to change—you'd just add a new row in the `Account` table for that user.

---

## How Data is Saved During Login (NextAuth + Prisma)

The beauty of using NextAuth alongside Prisma is that **you do not need to manually write SQL or Prisma queries to create the user**. 

By passing the `PrismaAdapter` into your NextAuth configuration, NextAuth automatically handles the entire database insertion process. 

### The Workflow:
1. **User Clicks Login**: The user clicks "Sign in with GitHub" and authorizes your application.
2. **GitHub Returns Data**: GitHub sends back the user's profile (Name, Email, Avatar) and their OAuth tokens (`access_token`).
3. **PrismaAdapter Takes Over**:
   - NextAuth checks if a `User` with that email already exists in the database.
   - **If it doesn't exist**: It creates a new `User` row and links a new `Account` row containing the GitHub tokens.
   - **If it does exist**: It logs them in and just updates any changed tokens in the `Account` table.
4. **Session Created**: Finally, it creates a new active `Session` in the database and sets the session cookie in the user's browser.

### Required Code (`app/api/auth/[...nextauth]/route.ts`)
To make this happen, your NextAuth config simply needs the adapter set up like this:

```typescript
import NextAuth from "next-auth"
import GithubProvider from "next-auth/providers/github"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import prisma from "@/lib/prisma" // Your instantiated Prisma Client

export const authOptions = {
  // 1. Tell NextAuth to use Prisma to store data
  adapter: PrismaAdapter(prisma), 
  
  // 2. Configure the GitHub Provider
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
  ],
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
```

As long as the adapter is configured, user creation and data population happen **100% automatically** upon a successful login.

---

## 📝 A Note on the Session Table and JWTs

In our specific configuration, we have explicitly told NextAuth to use **JSON Web Tokens (JWTs)** instead of database sessions by adding `session: { strategy: "jwt" }` to our `authOptions`.

### What does this mean?
Because we are using the JWT strategy, the `Session` table in your Prisma database **will remain completely empty**. NextAuth will store the session data entirely inside an encrypted cookie in the user's browser instead of writing rows to the database.

### Should we delete the `Session` model from `schema.prisma`?
**No, it is highly recommended to leave it there.**

1. **Adapter Requirements**: The NextAuth Prisma Adapter officially expects the `Session` model to exist in the schema. Even if it doesn't actively write to it when using JWTs, removing it can sometimes cause TypeScript or validation errors.
2. **Zero Cost**: It costs nothing to have an empty table in your Postgres database.
3. **Future Flexibility**: If you ever change your mind and decide you want to track active devices (for example, to add a "Log out of all other devices" feature), you can easily switch back to database sessions because the table is already set up and ready to go!

---

## 🔐 Storing IAM / Cloud Credentials in the Database

For AutoSRE AI to detect cloud misconfigurations (open S3 buckets, bad IAM policies, etc.), users will need to connect their cloud accounts (AWS, GCP, Azure). This means we need to **securely store their IAM credentials** in our database.

### Why not just use `.env` variables?
Environment variables work for **your own** cloud account, but AutoSRE is a multi-user platform. Each user connects **their own** AWS/GCP account, so we need to store credentials **per user** in the database.

### The Prisma Model

```prisma
model CloudCredential {
  id              String   @id @default(cuid())
  userId          String
  provider        String   // "aws" | "gcp" | "azure"
  label           String?  // User-friendly name, e.g., "My Production AWS"

  // All sensitive fields are stored ENCRYPTED (via encrypt.ts)
  accessKeyId     String   @db.Text  // Encrypted AWS Access Key ID
  secretAccessKey String   @db.Text  // Encrypted AWS Secret Access Key
  region          String?             // e.g., "us-east-1"
  roleArn         String?  @db.Text  // Encrypted IAM Role ARN (for assume-role)
  sessionToken    String?  @db.Text  // Encrypted temporary session token (STS)

  isActive        Boolean  @default(true)
  lastVerifiedAt  DateTime?          // Last time we confirmed creds are valid
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider, label])
}
```

> **⚠️ CRITICAL:** The `accessKeyId`, `secretAccessKey`, `roleArn`, and `sessionToken` fields must **always** be encrypted before saving and decrypted only when needed. Never store plain-text IAM keys.

### Fields Explained

| Field | Purpose |
|---|---|
| `id` | Unique identifier for the credential record. |
| `userId` | Links this credential to a specific user. |
| `provider` | Which cloud platform — `"aws"`, `"gcp"`, or `"azure"`. |
| `label` | A friendly name the user gives it (e.g., "Staging AWS", "Prod GCP"). |
| `accessKeyId` | The AWS Access Key ID (or equivalent for GCP/Azure), **stored encrypted**. |
| `secretAccessKey` | The AWS Secret Access Key, **stored encrypted**. This is the most sensitive field. |
| `region` | Default cloud region for API calls (e.g., `us-east-1`). |
| `roleArn` | An optional IAM Role ARN if the user wants us to use `AssumeRole` instead of direct keys. **Stored encrypted.** |
| `sessionToken` | Temporary credentials from AWS STS. **Stored encrypted.** |
| `isActive` | Whether this credential is currently being used for monitoring. |
| `lastVerifiedAt` | Timestamp of the last time we successfully made an API call with these creds. Helps detect expired/revoked keys. |
| `createdAt` / `updatedAt` | Standard timestamps. |

### How Encryption Works (Using `encrypt.ts`)

When a user submits their IAM credentials through the dashboard, the flow is:

```
User submits keys → API Route receives plain text → encrypt() → Save to DB
                                                                      │
User's cloud scan runs → Read from DB → decrypt() → Make AWS API call ←┘
```

**Saving credentials:**
```typescript
import { encrypt } from "@/lib/encrypt";
import { prisma } from "@/lib/prisma";

async function saveCredential(userId: string, data: any) {
  return prisma.cloudCredential.create({
    data: {
      userId,
      provider: data.provider,
      label: data.label,
      accessKeyId: encrypt(data.accessKeyId),         // Encrypted!
      secretAccessKey: encrypt(data.secretAccessKey), // Encrypted!
      region: data.region,
      roleArn: data.roleArn ? encrypt(data.roleArn) : null,
    },
  });
}
```

**Reading credentials (for cloud API calls):**
```typescript
import { decrypt } from "@/lib/encrypt";

async function getCredential(credentialId: string) {
  const cred = await prisma.cloudCredential.findUnique({
    where: { id: credentialId },
  });

  if (!cred) throw new Error("Credential not found");

  return {
    accessKeyId: decrypt(cred.accessKeyId),         // Decrypted!
    secretAccessKey: decrypt(cred.secretAccessKey), // Decrypted!
    region: cred.region,
    roleArn: cred.roleArn ? decrypt(cred.roleArn) : null,
  };
}
```

### Best Practices for IAM Credential Security

1. **Least Privilege:** Always instruct users to create IAM keys with **read-only** permissions. AutoSRE only needs to *scan* for misconfigurations, not modify resources.
2. **Prefer IAM Roles over Keys:** If possible, encourage users to provide a `roleArn` that we assume using STS, rather than long-lived access keys.
3. **Periodic Verification:** Use the `lastVerifiedAt` field to periodically test that credentials are still valid. Notify the user if they are revoked or expired.
4. **Never Log Credentials:** Ensure that decrypted credentials never appear in application logs, error messages, or API responses.
5. **Rotate the Encryption Key:** If your `ENCRYPTION_KEY` in `.env` is ever compromised, you must re-encrypt all stored credentials with a new key.
