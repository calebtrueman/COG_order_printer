# COG Order Printer

Embedded Shopify app that queues a packing slip print job as soon as a new order is assigned to a configured fulfillment location.

## How it works

- Shopify sends `orders/create` to `/webhooks/orders/create`.
- The app looks up the order's fulfillment orders and checks the assigned fulfillment location.
- If the location matches the configured rule, the app stores a packing-slip print job for the selected printer.
- A local print hook running on the single print computer polls the app, renders the packing slip, and sends it to the selected printer through CUPS.

Vercel cannot directly print to a USB or LAN printer. The local hook is the bridge that makes automatic physical printing possible without a paid print relay service.

## Settings

The embedded app configures:

- Fulfillment location
- Printer for that fulfillment location
- Print-agent token

Printers appear after the local hook registers them.

## Development

```shell
npm install
cp .env.example .env
npm run setup
npm run dev
```

`npm run dev` uses `shopify.app.local.toml` with localhost mode. Use `npm run dev:tunnel` when testing Shopify webhook delivery.

## Local print hook

Start the hook on the computer that can reach the target printer:

```shell
SHOPIFY_PRINTER_AGENT_URL=https://cog-order-printer.vercel.app \
SHOPIFY_PRINTER_AGENT_TOKEN=token-from-app-settings \
npm run agent
```

The hook expects macOS or another CUPS environment with:

- `lpstat` for printer discovery
- `lp` for printing
- Google Chrome, Microsoft Edge, or Chromium for HTML-to-PDF rendering

If a browser is not found, the hook falls back to sending the HTML file directly to CUPS.

## Production on Vercel

The app is configured for Vercel with React Router SSR and Prisma/Postgres.

Required environment variables:

- `DATABASE_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL=https://cog-order-printer.vercel.app`
- `SCOPES=read_orders,read_locations,read_merchant_managed_fulfillment_orders`
- `SHOPIFY_APP_DISTRIBUTION=single_merchant`

Deploy the web app first, then publish the Shopify app config against the hosted URL:

```shell
SHOPIFY_APP_URL=https://cog-order-printer.vercel.app npm run deploy:live
```

The Shopify app also needs protected customer data access for shipping addresses if packing slips should include the recipient address.
