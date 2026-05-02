# NextAuth.js Technical Documentation

## 1. Introduction

**What is NextAuth?**
NextAuth.js is a complete, open-source authentication solution for Next.js applications. It is designed from the ground up to support Next.js and Serverless environments, offering seamless integration with React Server Components, API routes, and Middleware.

**Why it is used**
Authentication is notoriously difficult. Implementing OAuth flows securely, managing cookies, protecting against CSRF attacks, and refreshing tokens takes significant engineering effort. NextAuth abstracts away the security boilerplate, providing a unified API to handle dozens of popular providers (Google, GitHub, Auth0) and database adapters.

**Problems it solves in authentication**
- **Token management**: Securely creates, stores, and validates JWTs or database sessions.
- **Cross-Site Request Forgery (CSRF)**: Built-in protection via double-submit cookie patterns.
- **Complexity of OAuth**: Handles the intricate multi-step OAuth 2.0 and OpenID Connect (OIDC) protocols under the hood.

*Real-world analogy*: Think of NextAuth as a bouncer at an exclusive club. Instead of you (the developer) checking every ID, spotting fake IDs, and stamping hands, NextAuth sits at the front door. It talks directly to the authorities (GitHub/Google) to verify the ID and then hands the user a tamper-proof VIP wristband (the session).

---

## 2. Core Concepts

**Authentication vs Authorization**
- **Authentication (AuthN)**: "Who are you?" (e.g., Logging in with GitHub).
- **Authorization (AuthZ)**: "What are you allowed to do?" (e.g., Checking if the logged-in user is an Admin). NextAuth primarily handles AuthN, though its callbacks can be used to pass along AuthZ roles.

**Session-based vs JWT-based auth**
- **JWT (JSON Web Token)**: The user's state is cryptographically signed and stored in a cookie in the browser. The server does not keep a record of the session. It's stateless.
- **Database Session**: The browser stores a random `sessionToken`. The server uses this token to look up the actual user session in a database. It's stateful.

**OAuth flow (GitHub/Google login explanation)**
OAuth delegates authentication. Instead of storing passwords, you redirect users to GitHub. GitHub authenticates them, asks for permission to share their profile with your app, and redirects them back with an authorization code. NextAuth trades this code for an access token to read their profile data.

**Providers in NextAuth**
A "Provider" is the service handling the login. NextAuth supports:
1. **OAuth/OIDC**: GitHub, Google, Twitter, etc.
2. **Credentials**: Custom username/password login (bypasses OAuth).
3. **Email**: Passwordless "Magic Link" login.

---

## 3. Architecture Overview

**How NextAuth works internally**
NextAuth operates via a single dynamic API route (`/api/auth/[...nextauth]`) that intercepts all authentication-related requests. It acts as a state machine managing login, callback handling, session retrieval, and logout.

**Request flow (login → callback → session)**
1. **Login**: Client calls `/api/auth/signin/github`. NextAuth generates a CSRF token, constructs an OAuth authorization URL, and redirects the user.
2. **Callback**: The user returns to `/api/auth/callback/github` with a code. NextAuth server exchanges the code for tokens, verifies the user, and triggers the `jwt` and `session` callbacks.
3. **Session**: The client calls `/api/auth/session` (or uses `getServerSession`). NextAuth reads the secure HTTP-only cookie, decodes the JWT, and returns the user object.

**Role of API routes**
The `[...nextauth]` catch-all route processes sub-paths:
- `GET /api/auth/providers`: Returns configured providers.
- `POST /api/auth/signin/:provider`: Initiates OAuth.
- `GET /api/auth/callback/:provider`: Handles OAuth callback.
- `GET /api/auth/session`: Returns current session.
- `POST /api/auth/signout`: Destroys the session cookie.

---

## 4. Installation & Setup

**Install dependencies**
```bash
npm install next-auth
```

**Basic project setup & Folder structure**
In Next.js 13+ (App Router), the configuration lives in `app/api/auth/[...nextauth]/route.ts`.

```text
client/
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts      <-- NextAuth Catch-all Route
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── AuthProvider.tsx          <-- Client Context Wrapper
```

---

## 5. Configuration Deep Dive

Let's look at a comprehensive `route.ts`:

```typescript
import NextAuth, { AuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const authOptions: AuthOptions = {
  // 1. Providers
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
  ],
  
  // 2. Session Strategy
  session: {
    strategy: "jwt", // Default for OAuth without an adapter
  },

  // 3. Pages (Customizing routes)
  pages: {
    signIn: '/auth/signin', // Overrides default NextAuth signin page
  },

  // 4. Callbacks
  callbacks: {
    async jwt({ token, user }) {
      // Runs when JWT is created or updated
      if (user) {
        token.id = user.id; // Inject user ID into token
      }
      return token;
    },
    async session({ session, token }) {
      // Runs when session is checked (useSession/getServerSession)
      if (session.user) {
        session.user.id = token.id as string; // Pass ID to client
      }
      return session;
    }
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

---

## 6. Authentication Flow (Step-by-Step)

Let's trace a user clicking "Sign in with GitHub":

1. **Client Action**: User clicks `<button onClick={() => signIn('github')}>`.
2. **Pre-flight Check**: `signIn()` makes a POST to `/api/auth/signin/github` with a CSRF token.
3. **Redirection (OAuth Handshake)**: NextAuth responds with a redirect URL to `https://github.com/login/oauth/authorize?...`. The user leaves your site.
4. **User Grants Consent**: User clicks "Authorize" on GitHub.
5. **Callback**: GitHub redirects back to your app: `/api/auth/callback/github?code=XYZ`.
6. **Token Exchange**: Under the hood, NextAuth makes a secure Server-to-Server POST request to GitHub, trading `code=XYZ` for an `access_token`.
7. **Profile Retrieval**: NextAuth uses the `access_token` to fetch user details (Name, Email, Image) from GitHub's API.
8. **Session Creation**: 
   - *If using JWT*: NextAuth encrypts the profile data into a JWE (JSON Web Encryption) and sets it as an `HttpOnly`, `Secure` cookie.
   - *If using Database*: NextAuth creates a user record and a session record in the database, and sets a random string cookie.

---

## 7. JWT vs Database Sessions

| Feature | JWT (JSON Web Token) | Database Sessions |
| :--- | :--- | :--- |
| **Storage** | Encrypted string in a browser Cookie | Row in a database table |
| **Lookup Speed** | Instant (No DB calls needed) | Slower (Requires a DB query per request) |
| **Revocation** | Hard (Tokens live until expiry) | Easy (Delete the DB row instantly logs user out) |
| **Data Size** | Limited (Cookies max out ~4KB) | Unlimited |
| **Best For** | High traffic, stateless architectures | Security-critical apps needing instant lockout |

*Analogy*: JWT is like an unforgeable physical ticket. The guard just looks at it and lets you in. A Database Session is like a hotel room keycard. The guard scans it and checks the central computer to see if your card is still active.

---

## 8. Callbacks Explained in Depth

Callbacks are asynchronous functions you can use to control what happens when an action is performed.

- **`jwt`**: Fired whenever a JSON Web Token is created (at login) or updated (when accessed). Use this to attach custom data (like Roles or Provider IDs) to the token.
- **`session`**: Fired whenever a session is checked on the client (`useSession`) or server (`getServerSession`). By default, NextAuth only returns name, email, and image for security. You **must** use this callback to pass custom token data to the client.
- **`signIn`**: A powerful interceptor. Runs before a user is allowed to log in. Return `false` to block login (e.g., banning a user, or restricting to specific email domains).
- **`redirect`**: Controls where the user goes after login/logout. Useful for sending users back to the page they were originally trying to access.

---

## 9. Protecting Routes

### Client-Side Protection (`useSession`)
```tsx
"use client";
import { useSession } from "next-auth/react";

export default function Dashboard() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      // Redirect to login
    }
  });

  if (status === "loading") return <p>Loading...</p>;
  return <h1>Welcome {session.user.name}</h1>;
}
```

### Server-Side Protection (`getServerSession`)
```tsx
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

export default async function ServerDashboard() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect("/api/auth/signin");
  }

  return <h1>Secure Data: {session.user.email}</h1>;
}
```

### Next.js Middleware (Edge Protection)
Create `middleware.ts` in the root:
```typescript
export { default } from "next-auth/middleware";

export const config = { matcher: ["/dashboard/:path*"] };
```
*Note*: Middleware only works with JWT sessions, as Edge runtimes cannot easily query traditional databases!

---

## 10. Database Integration

To persist users, you use an **Adapter**. 

```bash
npm install @auth/prisma-adapter @prisma/client
```

```typescript
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [/* ... */],
  // Note: When you add an adapter, the default session strategy changes to "database".
};
```
When a user logs in via GitHub:
1. NextAuth checks the `Account` table for a linked GitHub ID.
2. If none exists, it creates a `User` and an `Account`.
3. It creates a `Session` record and sends the session token cookie.

---

## 11. Security Considerations

- **CSRF Protection**: NextAuth automatically generates CSRF tokens using the "Double Submit Cookie" pattern. A malicious site cannot force a login/logout because it cannot read your cookies to submit the matching CSRF token.
- **Token Security**: JWTs are created using JWE (JSON Web Encryption). The payload is fully encrypted, not just Base64 encoded. The client cannot read the token contents directly.
- **Environment Variables**: `NEXTAUTH_SECRET` is the cryptographic key used to sign/encrypt cookies. If this leaks, attackers can forge admin sessions. Keep it highly secure.
- **SameSite Cookies**: Session cookies default to `SameSite=Lax`, preventing them from being sent in cross-site contexts, which stops CSRF attacks on API routes.

---

## 12. Common Mistakes & Debugging

**Error: `CLIENT_FETCH_ERROR`**
- *Cause*: The client cannot reach `/api/auth/session`. Often happens if `NEXTAUTH_URL` is misconfigured in production or if your dynamic route file is named incorrectly.
- *Fix*: Ensure your route is exactly `app/api/auth/[...nextauth]/route.ts`.

**Error: Custom data is missing in `useSession()`**
- *Cause*: Adding data to the `jwt` callback does not automatically expose it to the `session` callback for security reasons.
- *Fix*: Explicitly map `token.customData` to `session.customData` in the `session` callback.

**Error: OAuth Redirect URI Mismatch**
- *Cause*: The URL configured in the GitHub/Google developer console doesn't match where NextAuth is hosted.
- *Fix*: Ensure the callback URL in GitHub is exactly: `http://localhost:3000/api/auth/callback/github` (or your production URL).

---

## 13. Best Practices

1. **Always use Server Components for fetching sessions**: `getServerSession` is vastly superior to `useSession` because it doesn't require a network request; it reads the cookie directly from the incoming HTTP request.
2. **Keep JWTs Small**: Cookies have a 4096-byte limit. Don't stuff massive JSON objects into the `jwt` callback.
3. **Rotate Secrets**: Regularly rotate `NEXTAUTH_SECRET` and OAuth provider secrets in production.
4. **Use Middleware for Static Protection**: Middleware prevents the server from even rendering a protected page if the user is logged out, saving CPU cycles and preventing flash-of-unauthenticated-content (FOUC).

---

## 14. Example Project Walkthrough

A minimal implementation flow:
1. Setup GitHub OAuth App -> Get ID & Secret.
2. Put them in `.env`:
   ```env
   GITHUB_ID=abc
   GITHUB_SECRET=xyz
   NEXTAUTH_SECRET=super_secret_random_string
   ```
3. Create `app/api/auth/[...nextauth]/route.ts` with the `GithubProvider`.
4. Create a Client wrapper `components/AuthProvider.tsx` with `<SessionProvider>`.
5. Wrap your layout: `<AuthProvider>{children}</AuthProvider>`.
6. Use `<button onClick={() => signIn('github')}>` to launch the flow.
7. Use `const session = await getServerSession(authOptions)` to secure your pages!

---

## 15. Summary

NextAuth.js drastically simplifies authentication by standardizing the flow for OAuth, Email, and Custom credentials. By understanding its internal request flow, the difference between JWT and database sessions, and how to properly utilize its powerful callback system, you can build highly secure, scalable authentication systems in Next.js with minimal boilerplate.
