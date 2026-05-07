# COG Order Printer

Embedded Shopify app that queues a packing slip print job as soon as a new order is assigned to a configured fulfillment location.

## How it works

- Shopify sends `orders/create` to `/webhooks/orders/create`.
- The app looks up the order's fulfillment orders and checks the assigned fulfillment location.
- If the location matches the configured rule, the app stores a packing-slip print job for the selected printer.
- A local print hook running on the single print computer polls the app, renders the packing slip, and sends it to the selected printer.

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

## Windows print service

Build the self-contained Windows service package:

```shell
npm run agent:windows
```

The build output is `dist/COGOrderPrinterAgent-windows-x64.zip`. Copy that zip to the Windows shipping computer, extract it somewhere permanent like `C:\COGOrderPrinterAgent`, then run PowerShell as Administrator:

```powershell
.\install-service.ps1
```

The first run creates `agent-config.json`. Paste the `appUrl` and `token` shown in the Shopify app's Print agent section, save the file, then run `.\install-service.ps1` again.

The package includes:

- `COGOrderPrinterAgent.exe`, a bundled Node runtime and agent
- `COGOrderPrinterAgent.Service.exe`, a WinSW service wrapper
- `SumatraPDF.exe`, used for silent PDF printing to a named Windows printer
- PowerShell scripts to install, restart, uninstall, and test the service

Windows notes:

- Microsoft Edge or Google Chrome must be installed for HTML-to-PDF rendering. Edge is already present on normal Windows 10/11 installs.
- If the target printer is installed only for one Windows user, install the service under that account: `.\install-service.ps1 -Username ".\shipping-user"`.
- Logs are written to the package's `logs` folder.

## Developer print hook

Start the hook on the computer that can reach the target printer:

```shell
SHOPIFY_PRINTER_AGENT_URL=https://cog-order-printer.vercel.app \
SHOPIFY_PRINTER_AGENT_TOKEN=token-from-app-settings \
npm run agent
```

When run directly from this repo, the hook expects macOS/Linux CUPS or Windows with the packaged helper files. On CUPS systems it uses:

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

When a change adds a new Prisma migration, run `npm run migrate:deploy` against production before or during the rollout. Normal Vercel builds only generate Prisma Client and build the app.

The Shopify app also needs protected customer data access for shipping addresses if packing slips should include the recipient address.
