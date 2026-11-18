# Database backups

The live database is backed up every night at 2:00 AM IST by
`.github/workflows/db-backup.yml`. Each backup is kept for 30 days as a
workflow artifact named `mysilvers-db-YYYY-MM-DD`.

Supabase's free plan keeps no backups of its own, so these are the only copies.

## What is in a backup

The whole `public` schema: products, orders, customers, settings, CMS content,
reviews, coupons, the activity log — everything the shop stores. Images are not
in it; they live in Cloudinary.

It is a `pg_dump` custom-format file, encrypted with AES-256 (gpg) using the
`BACKUP_PASSPHRASE` secret.

> ⚠️ The repository is public. Anyone signed in to GitHub can download the
> artifact, which is why it is encrypted. **Keep the passphrase somewhere safe
> outside GitHub** (a password manager). GitHub will not show a secret again
> once saved, and a backup can't be opened without it.

## Checking backups run

GitHub → Actions → **Nightly database backup**. A green tick per night. GitHub
emails the repository owner when a scheduled run fails. Run one by hand with
**Run workflow**.

## Restoring

Restoring overwrites data. Do it into a **new, empty** Supabase project first,
check it, and only then point the shop at it (or copy back the rows you need).

1. Download the artifact (a .zip) from the workflow run and unzip it.
2. Decrypt it (you'll be asked for the passphrase):

   ```sh
   gpg --output mysilvers.dump --decrypt mysilvers-db-YYYY-MM-DD.dump.gpg
   ```

3. Restore into the target database with the Postgres 17 tools:

   ```sh
   pg_restore --no-owner --no-privileges --clean --if-exists \
     --dbname "postgresql://…target session-pooler URL…" mysilvers.dump
   ```

4. Delete the decrypted `mysilvers.dump` when done — it contains customer data.

The schema in the backup matches the migrations up to the night it was taken.
After restoring into a fresh project, `npx prisma migrate status` against it
should report it up to date.
