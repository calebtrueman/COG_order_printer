# COG Order Printer

Embedded Shopify app that queues a packing slip print job as soon as a new order is assigned to a configured fulfillment location.

## How it works

- Shopify sends `orders/create` and fulfillment-order routing webhooks to the app.
- The app waits for fulfillment routing, then looks up the order's fulfillment orders and checks the assigned fulfillment location.
- If the location matches the configured rule and still has open fulfillment items, the app stores a packing-slip print job for the selected printer.
- A local print hook running on the single print computer polls the app, renders the packing slip, and sends it to the selected printer.
- When the Windows service starts or resumes after sleep, it asks the app to scan Shopify for open orders created after the latest automatic print and queues any matching missed jobs.

Vercel cannot directly print to a USB or LAN printer. The local hook is the bridge that makes automatic physical printing possible without a paid print relay service.

## Settings

The embedded app configures:

- Fulfillment location
- Printer for that fulfillment location
- Print-agent token
- Packing slip template

Printers appear after the local hook registers them.

Use **Reprint Packing Slip** in the embedded app to load currently unfulfilled orders assigned to the configured location. Nothing prints from that list until you manually click **Print** on a specific order.

The template editor stores a drag-and-drop packing slip layout. Blocks can use order data fields, custom text with `{{field.name}}` tokens, custom image URLs, product images, and the line-item table.

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

The build output is `dist/COGOrderPrinterAgent-windows-x64.zip`. Copy that zip to the Windows shipping computer and extract it somewhere permanent like `C:\COGOrderPrinterAgent`.

No PowerShell scripts are required. Right-click `COGOrderPrinterAgentSetup.exe` and choose **Run as administrator**.

The first run creates `agent-config.json` and opens it in Notepad. Paste the `appUrl` and `token` shown in the Shopify app's Print agent section, save, close Notepad, and setup will continue.

The package includes:

- `COGOrderPrinterAgent.exe`, a bundled Node runtime and agent
- `COGOrderPrinterAgentSetup.exe`, the installer/config/service-control executable
- `COGOrderPrinterAgent.Service.exe`, a WinSW service wrapper
- `SumatraPDF.exe`, used for silent PDF printing to a named Windows printer

Windows notes:

- Microsoft Edge or Google Chrome must be installed for HTML-to-PDF rendering. Edge is already present on normal Windows 10/11 installs.
- Use `COGOrderPrinterAgentSetup.exe run` from an Administrator Command Prompt to test in the foreground before installing the service.
- Use `COGOrderPrinterAgentSetup.exe restart`, `status`, or `uninstall` for service control.
- Leave the service set to Automatic. After a reboot, service restart, sleep, or lid close/wake cycle, it will register printers, reconcile missed open orders since the latest automatic print, then print queued jobs.
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

For print debugging on macOS, keep the generated HTML/PDF files and show the
CUPS request id in the print-job message:

```shell
SHOPIFY_PRINTER_KEEP_FILES=1 \
SHOPIFY_PRINTER_DEBUG_DIR=./debug-prints \
SHOPIFY_PRINTER_AGENT_URL=https://cog-order-printer.vercel.app \
SHOPIFY_PRINTER_AGENT_TOKEN=token-from-app-settings \
npm run agent
```

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
