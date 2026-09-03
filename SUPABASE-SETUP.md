# Supabase deployment checklist

Apply the database changes before deploying the updated frontend.

1. In Supabase Authentication, ensure the administrator user
   `alvisa@admin.com` already exists.
2. Run `supabase-schema.sql` with a database-owner connection or in the
   Supabase SQL Editor.
3. In Authentication → URL Configuration, add the deployed URLs for:
   - `/login.html`
   - `/reset-password.html`
4. Confirm email/password sign-up and email confirmation settings match the
   desired user-registration policy.
5. Run the Security Advisor after applying the schema.

The frontend uses a public/anonymous Supabase key. That key is safe to expose
only because the table is protected by RLS and public access is limited to the
three exact-match RPC functions defined in `supabase-schema.sql`.

## Local checks

```bash
for file in *.js; do node --check "$file"; done
node --test tests/*.test.js
```
