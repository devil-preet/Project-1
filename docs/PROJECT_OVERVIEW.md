# Project Overview

## Product
A multi-tenant commerce platform where independent brands register a business, manage a catalog
(categories, products, images), configure their store identity, and (later) publish a customer
storefront. One deployment serves many brands; each brand's data is isolated.

## System 1 — Business Management Portal (this repository)
Used by business owners and their staff. Scope:
registration/auth, business onboarding, dashboard, categories, products + image uploads,
branding, media library, team management (invitations + roles), business settings.

## System 2 — Customer Storefront (NOT started)
Separate application, brand-specific URLs, reads the same Firestore data. System 1 is designed so
System 2 needs no redesign:
- `slugs/{slug}` → `businessId` public lookup.
- Public read rules exist for **active** products/categories and `settings/branding|store` of a
  business whose `storeStatus == 'published'`.
- Prices are integer cents; images are publicly readable Storage objects.

## Technology stack
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui
(base-ui flavour) · lucide-react · Zod 4 · React Hook Form · Firebase Auth / Firestore / Storage ·
Firebase Admin SDK (server) · Vitest · Firebase Emulator Suite. Target hosting: Firebase App Hosting.

## Architecture in one paragraph
Browsers talk to Next.js route handlers/server actions. All mutations and all credential flows run
server-side with the Admin SDK after an explicit authorization check (`lib/auth/guard.ts`).
Firestore/Storage security rules are an independent second layer: clients may **read** their own
tenant's data and **upload** images to their tenant's folder, but can never write Firestore.

## Multi-tenant strategy
Every business has a `businessId` (Firestore auto-id). Tenant data lives under
`businesses/{businessId}/…`. Membership is a document at `businesses/{id}/members/{uid}` (doc id = uid)
holding the role. Both the server guard and the rules derive access **only** from that document;
a `businessId` supplied by a client is never trusted. See `ARCHITECTURE.md`.

## Firebase project (non-secret)
Project `project-1-eb8c3` · Auth domain `project-1-eb8c3.firebaseapp.com` · Storage bucket
`project-1-eb8c3.firebasestorage.app` (US-EAST1) · Firestore `nam5` · Web app id
`1:374634192845:web:b1a635a7524a3a57e16e84`. See `FIREBASE_SETUP.md`.

## Current status
Phases 1 (foundation), 2 (authentication) and 3 (business registration, tenant initialisation, onboarding) are complete and verified on emulators and in real Chrome.
The Catalogue & Storefront milestone (workspace shell, categories, products, product images, public `/s/{slug}` storefront) is built and tested locally - see `DEVELOPMENT_STATUS.md`. The `members.uid` index is deployed and verified READY.
