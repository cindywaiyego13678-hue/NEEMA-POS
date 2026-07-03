# Setting up "Add Staff" (owner self-service)

This adds a **Staff** page to the app where the owner can create cashier/manager accounts themselves — no more manual Supabase steps.

It needs one small piece deployed to Supabase first: an **Edge Function** called `create-staff`. This is a tiny bit of server-side code that safely creates the login + staff record together (this can't be done directly from the browser without exposing a secret key, so it has to run on Supabase's side).

## Option A — Deploy via Supabase Dashboard (no install needed, easiest)

1. In your Supabase project, go to **Edge Functions** in the left sidebar
2. Click **Create a new function**
3. Name it exactly: `create-staff`
4. Delete the placeholder code it gives you, and paste in the entire contents of `supabase/functions/create-staff/index.ts`
5. Click **Deploy**

That's it — no environment variables to set manually, Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to every Edge Function.

## Option B — Deploy via Supabase CLI (if you prefer command line)
```bash
npm install -g supabase
supabase login
supabase link --project-ref ipbqeyeanlyvklrjcbxl
supabase functions deploy create-staff
```

## After deploying

1. Open `staff.html` in your browser (or click the new **Staff** tab in the app's nav bar — it now appears on POS, Inventory, and Dashboard for admin accounts)
2. Click **+ New Staff**
3. Fill in their name, email, a temporary password, and pick their role
4. Click **Create Staff Account**
5. Tell them their email + password so they can log in

The page also shows everyone currently on staff, with a **Deactivate** button if someone leaves — this disables their login access without deleting their sales history.

## Troubleshooting
- **"Failed to fetch" or CORS error** → the function likely isn't deployed yet, or the name isn't exactly `create-staff`
- **"Only admins can add staff"** → you're logged in as a non-admin account
- **Function deployed but still failing** → double check in Edge Functions logs (Supabase dashboard → Edge Functions → create-staff → Logs) for the actual error message
