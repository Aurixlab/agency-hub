/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
```

(We're removing the `serverComponentsExternalPackages: ['argon2']` since we no longer use argon2.)

Commit this.

---

### After All 4 Commits

Vercel will auto-redeploy. Wait for the build to succeed. Then you need to **re-seed the database** because the passwords were hashed with argon2 before and now the app uses bcrypt — the old hashes won't work.

Open your terminal locally:
```
cd I:\Work\Notion Project\agency-hub
```

Update the same files locally too, then:
```
npm install bcryptjs @types/bcryptjs
```
```
npm uninstall argon2
```
```
npx tsx prisma/seed.ts
