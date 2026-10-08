## How it works

Paste a Cloudflare API token and the page shows how much of the Workers Free plan your account
has used: Workers requests, KV operations and storage, R2 operations and storage, D1 rows and
storage, Durable Objects, Queues and Workers AI. Each number sits next to its free allowance and
says when it resets.

## Creating a token

1. Open [API tokens](https://dash.cloudflare.com/profile/api-tokens) in the Cloudflare dashboard
   and choose **Create Token**, then **Create Custom Token**.
2. Under **Permissions** add *Account*, *Account Analytics*, *Read*. That one permission covers
   every dataset this tool reads.
3. Under **Account Resources** pick the account you want to check.
4. Under **TTL** set the token to expire today or tomorrow. The tool never stores it, so there is
   no reason for it to live longer.

The **Create a token** button on this page opens that form with the permission filled in.

## Privacy

The Cloudflare API does not allow browsers to call it directly, so this tool is the one on this
site that uses a server. Your token travels to this site's server once per check, is used to ask
Cloudflare for the numbers, and is then dropped. It is not logged, cached or stored, and it is gone
from this page as soon as you reload or press **Start over**. The page's Content Security Policy
only lets it talk to this site.

## What the numbers mean

- The numbers come from Cloudflare's GraphQL Analytics API, the same source as the dashboard
  charts. Those datasets are sampled, so treat the figures as close estimates. Cloudflare's own
  billing counters are the ones that decide when a limit is hit.
- Daily limits reset at 00:00 UTC. R2 operations count per calendar month. Storage figures are the
  latest reported size.
- The free allowances are the ones published on Cloudflare's pricing pages in October 2026. If
  Cloudflare changes a limit, the bar here will be wrong until the tool is updated.
- Pages builds, Vectorize and Workflows are not covered yet.
