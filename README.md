# Chat site configuration

Run `npm install` and then `npm start`.

## Administrator secrets

Administrator credentials are no longer stored in the repository. Configure them as environment variables in the deployment environment:

- `PRIVILEGED_ADMIN_NSIJISKI`
- `PRIVILEGED_ADMIN_HYUUKJ`
- `PRIVILEGED_ADMIN_UKINA`
- `PRIVILEGED_ADMIN_MSAMU`
- `ADMIN_PASSWORDS` (comma-separated values for normal administrators)

Set new secrets; credentials that were previously committed to a public repository should be considered exposed and rotated. Never put real secrets in frontend files or commit them to Git.

The chat UI uses server-side API endpoints and JSON files in `data/` for persistence. For production, use a database, HTTPS, secure session storage, and a trusted proxy configuration for client IP handling.
