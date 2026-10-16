# Portfolia — Online Portfolio Template Generator

A beginner-friendly portfolio builder made with HTML, CSS, JavaScript, Supabase, and Vercel.

## Features

- Responsive home page and portfolio information form
- Exactly three distinct templates: **Simple**, **Modern**, and **Creative**
- Create, read, update, and delete portfolio records in an online Supabase database
- Education, skills, projects, work experience, contact information, and external links
- Optional profile-picture upload to Supabase Storage or a public image URL
- Preview generated portfolios and print/save them as PDF
- Session-based anonymous Supabase authentication and Row Level Security
- Data remains saved after a refresh in the same browser session

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript
- Supabase PostgreSQL, Authentication, and Storage
- Vercel static hosting

## Project files

- `index.html` — all website pages and form fields
- `styles.css` — responsive app design and all three portfolio template styles
- `app.js` — navigation, form parsing, template generation, upload, and database CRUD
- `config.js` — public Supabase project URL and publishable/anon key placeholders
- `schema.sql` — database table, RLS policies, update trigger, and image bucket policies
- `vercel.json` — Vercel static-site routing configuration

## Setup step 1: Create your Supabase project

1. Go to https://supabase.com/ and sign in.
2. Create a new project. Save your database password privately; **do not put it in the website code or submit it**.
3. Wait for the database to finish provisioning.
4. Open **SQL Editor** in the Supabase dashboard.
5. Create a new query, copy all the contents of `schema.sql`, and run it.
6. Open **Authentication → Sign In / Providers** (the exact menu wording may vary).
7. Enable **Anonymous Sign-Ins**. The app uses an anonymous Supabase user so each browser session can save and manage its own records.
8. Open **Project Settings → API** or the project's **Connect** panel. Copy the Project URL and the publishable key (or legacy `anon` key). Do not copy the `service_role` key.

### Why anonymous authentication?

The instructor can open the public website and create a portfolio without making an account. Supabase issues a browser session, and Row Level Security restricts database operations to records owned by that session. Records are available in the same browser profile/session. Anonymous sessions are not a substitute for a permanent account: clearing browser data or changing browsers can make the anonymous user's saved records inaccessible.

For a real multi-user product, add email/password or OAuth sign-in, account recovery, rate limits, and a deliberate public-sharing feature before publishing other people's portfolios.

## Setup step 2: Add your Supabase keys

Open `config.js` and replace the placeholder values:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://your-project-ref.supabase.co",
  SUPABASE_ANON_KEY: "your-publishable-or-anon-key"
};
```

The publishable/anon key is designed to be used in a browser **only when RLS is correctly enabled**. Never expose a service-role key, database password, or other secret. Do not commit private credentials to GitHub.

## Setup step 3: Run locally

This is a static site; no Node.js build is required.

1. Install Visual Studio Code: https://code.visualstudio.com/
2. Open the extracted project folder in VS Code.
3. Install the **Live Server** extension, or use any static HTTP server.
4. Right-click `index.html` and select **Open with Live Server**.
5. Test create, preview, edit, refresh, and delete. For storage uploads, use an image smaller than 2 MB.

Avoid opening `index.html` directly as a `file://` URL; use a local server instead.

## Setup step 4: Deploy to Vercel

1. Create a GitHub account if you do not have one: https://github.com/
2. Create a new repository and upload the project files.
3. Before pushing, check `config.js` to ensure it contains only the Supabase project URL and public publishable/anon key. Do not include secrets.
4. Sign in to https://vercel.com/ and choose **Add New → Project**.
5. Import your GitHub repository.
6. Framework preset: **Other**. Build command: leave empty. Output directory: `.` (or the repository root if Vercel detects the static files).
7. Deploy. Vercel will provide a public `https://...vercel.app` URL.
8. Open that URL in a private/incognito browser window and test the complete flow.
9. If you change code, push the changes to GitHub; Vercel redeploys automatically.

`vercel.json` is included to make static-page routing predictable.

## Database structure

Table: `public.portfolios`

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID | Portfolio identifier |
| `user_id` | UUID | Owner's Supabase Auth user ID |
| `title` | text | Portfolio title |
| `full_name` | text | Full name |
| `profile_picture` | text | Public image URL |
| `email` | text | Email address |
| `contact_number` | text | Contact number |
| `address` | text | Address |
| `about_me` | text | Biography |
| `education` | JSONB | Education entries |
| `skills` | JSONB | Skills array |
| `projects` | JSONB | Project entries |
| `experience` | JSONB | Work experience entries |
| `social_links` | JSONB | Social/website link entries |
| `template` | text | `simple`, `modern`, or `creative` |
| `created_at` | timestamptz | Creation time |
| `updated_at` | timestamptz | Last update time |

The SQL adds owner-only RLS policies for Select, Insert, Update, and Delete. It also creates an index and an automatic `updated_at` trigger.

## Entering repeated information

The form uses one entry per line so the project stays simple:

- Education: `Qualification | School | Year`
- Project: `Project name | Description | https://project-link.example`
- Experience: `Role | Organization | Dates | Description`
- Social link: `GitHub | https://github.com/yourname`
- Skills: comma-separated or one per line

Use `|` as the separator and avoid typing it inside an individual field.

## How to test against the rubric

1. Open the deployed website URL.
2. Click **Create Portfolio**.
3. Enter a full name and some education, skills, projects, and experience.
4. Select each of the three templates and preview it.
5. Save a portfolio and verify it appears under **My Portfolios**.
6. Refresh the browser; the saved record should still be there for the same anonymous browser session.
7. Edit a saved record and verify the changed values.
8. Delete a saved record and verify it disappears.
9. In Supabase **Table Editor → portfolios**, confirm the record is stored online.
10. Test the public deployment on a phone-sized viewport.
11. Confirm there are exactly three template options: Simple, Modern, Creative.

## Known limitations / next improvements

- Anonymous user records belong to the browser session. Add a proper sign-in flow if users need to access their portfolios from other devices or recover them later.
- This version's generated preview is for the owner session; it does not implement a public shareable URL for every saved portfolio.
- Uploaded profile pictures are public-readable because the bucket is public. Do not upload sensitive images.
- Anonymous sign-in may be subject to Supabase abuse-prevention/rate limits. Enable CAPTCHA or other protections if needed for a public launch.
- This is a school project starter. Test policies and all flows in your own Supabase project before submitting.

## Project documentation checklist

- Project Title: Online Portfolio Template Generator (Portfolia)
- Project Description: A responsive web application that allows a user to enter professional details, save them to an online database, select one of three portfolio designs, preview the generated portfolio, and manage saved records.
- Technologies Used: HTML, CSS, JavaScript, Supabase, Vercel
- Database Platform: Supabase PostgreSQL
- Hosting Platform: Vercel
- Database Structure: `public.portfolios` table; see schema above
- Screenshots: Home page, information form, template gallery, each of the three portfolio previews, saved portfolio list, edit flow, delete confirmation, and Supabase Table Editor
- Published Website URL: add your Vercel URL after deployment

## Submission safety

Submit your published website URL, source-code repository URL, database platform name, and documentation. Never submit your Supabase database password, service-role key, access tokens, or other private credentials.
