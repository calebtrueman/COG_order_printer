# COG Order Printer

Embedded Shopify app that submits a packing slip print job as soon as a new order is assigned to a configured fulfillment location.

## How it works

- Shopify sends `orders/create` to `/webhooks/orders/create`.
- The app looks up the order's fulfillment orders and checks the assigned fulfillment location.
- If the location matches the configured rule, the app renders a packing slip PDF.
- Vercel submits the PDF directly to the configured PrintNode printer.

This removes the custom polling component. The only printer-side requirement is the standard PrintNode client for the computer or print server that can see the target printer.

## Settings

The embedded app configures:

- Fulfillment location
- PrintNode printer for that fulfillment location

Printers are loaded live from the PrintNode API key configured in Vercel.

## Development

```shell
npm install
cp .env.example .env
npm run setup
npm run dev
```

`npm run dev` uses `shopify.app.local.toml` with localhost mode. Use `npm run dev:tunnel` when testing Shopify webhook delivery.

## Production on Vercel

The app is configured for Vercel with React Router SSR and Prisma/Postgres.

Required environment variables:

- `DATABASE_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL=https://cog-order-printer.vercel.app`
- `SCOPES=read_orders,read_locations,read_merchant_managed_fulfillment_orders`
- `SHOPIFY_APP_DISTRIBUTION=single_merchant`
- `PRINTNODE_API_KEY`

Deploy the web app first, then publish the Shopify app config against the hosted URL:

```shell
SHOPIFY_APP_URL=https://cog-order-printer.vercel.app npm run deploy:live
```

The Shopify app also needs protected customer data access for shipping addresses if packing slips should include the recipient address.
