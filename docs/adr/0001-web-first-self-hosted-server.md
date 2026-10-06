# 0001. Web first, with a self-hosted server

- Status: accepted
- Date: 2026-10-06

## Context

Mirador is meant to be used mostly on a phone. Native iOS apps need a paid Apple developer account and App Store review, and the maintainer's home power and internet are not reliable enough to depend on a device as the only copy of the data. People also want every device to show the same data.

## Decision

Version 1 is a responsive, phone-first web app (installable as a PWA) that talks to a self-hosted server: a TypeScript monorepo with a React web client, a Node.js server and PostgreSQL, shipped as one Docker image. The app is online only, except for quick add, which queues entries on the device while offline (WID-09). How the server is hosted and reached is the choice of whoever runs it. Native apps may follow later if there is interest; core logic stays separate from the UI so they can reuse it (NFR-10).

## Consequences

- No App Store account or review is needed, and every device works the same way.
- A home-screen widget is not possible in V1; quick add is a button on every screen instead.
- Someone has to run a server, so install, update and backup documentation is part of the product (NFR-15).
- Text recognition and category suggestions run on that server (IMP-11, IMP-24), which sets a floor on the server's memory.

The full reasoning is in the Technology Stack document linked from the README.
