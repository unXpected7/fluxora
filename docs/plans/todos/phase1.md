# Fluxora Studio — Phase 1 website redesign plan

**Status:** Planned  
**Primary outcome:** Replace the current dark, technology-heavy landing page with a more editorial and elegant company profile for Fluxora Studio.  
**Scope:** Public marketing homepage and its contact journey. Keep the current React/Vite/Nginx deployment model.

## Current deployment baseline

As of 2026-10-03, the GitHub Actions runner is active on vm01 and both static site environments are deployed. The dev site responds on `10.10.0.2:8093`; production responds on `10.10.0.2:8094`. Public gateway vhosts are staged but not enabled. The owner reports that Cloudflare DNS records have been added; verify they resolve, issue origin TLS certificates, then enable and reload the gateway routes during release.

## 1. Goal and audience

The site should help Indonesian and international business owners understand what Fluxora builds, decide whether the studio fits their needs, and start a project conversation. In the first few minutes, a visitor should be able to answer:

1. What does Fluxora Studio do?
2. Which of its services is relevant to my business?
3. What is it like to work with the team?
4. How do I contact the studio?

The main offer is custom digital product work across four service lines:

- E-commerce platforms
- AI assistants
- ERP and logistics systems
- E-ticketing platforms

The page should describe outcomes and the operational problem each service solves, not only list technologies.

## 2. Reference direction

### Software Studio Pro

Use [Software Studio Pro’s homepage](https://www.softwarestudiopro.com/) as an information-architecture reference. Its page gives visitors a broad but orderly introduction: studio positioning, services and solution categories, proof and portfolio, working process, engagement information, FAQs, and contact paths. Adapt that progression to Fluxora’s four offerings and actual business facts.

Do not carry over its specific prices, free-website offer, statistics, client names, testimonials, tools, project names, copy, or images. Add a claim only when Fluxora can substantiate it.

### Nilam Store

Use Nilam’s editorial character as the visual reference:

- Serif display headings paired with clean sans-serif body text
- Small, restrained monospace labels for section identifiers
- Generous page margins and whitespace
- Product/editorial imagery composed with a simple geometric frame
- Fine dividers, quiet surfaces, and deliberate contrast between sections
- Clear hierarchy and calm motion rather than a dashboard-like or neon-tech treatment

Keep Fluxora’s own information architecture, logo, imagery, and component styling. The result should feel like a digital product studio, not a fashion storefront.

## 3. Proposed visual system

### Visual thesis

**An editorial technology studio:** considered typography and magazine-like composition, balanced with diagrams and imagery that make connected software systems feel tangible.

### Starting palette

This is a starting point for implementation and contrast checks. It deliberately avoids Nilam’s forest-green and terracotta combination.

| Token | Starting value | Use |
|---|---|---|
| Ink navy | `#1B293B` | Headings, navigation, dark section backgrounds |
| Porcelain | `#F5F6F4` | Main page background |
| White | `#FFFFFF` | Cards and elevated content surfaces |
| Slate blue | `#526A9D` | Primary accent, links, selected details |
| Muted brass | `#B17C4D` | Small highlights and secondary accent |
| Mist | `#E5E9EF` | Alternate section surfaces |
| Slate text | `#5E6877` | Supporting copy |
| Fine line | `#D5D9DE` | Borders and separators |

Use the accent colors sparingly. Body copy and calls to action must retain strong contrast; verify all text, focus, hover, and disabled states during implementation.

### Typography and composition

- Use a refined serif face for large display headings, a highly readable sans serif for paragraphs and controls, and monospace only for brief metadata labels.
- Keep body copy at readable sizes, with comfortable line lengths and line height.
- Use an asymmetrical split hero and purposeful image placement instead of repeating the same centered-title/card-grid pattern in every section.
- Alternate porcelain, white, mist, and ink-navy sections to give the long page a clear rhythm.
- Prefer thin rules and square or lightly softened corners over heavy shadows and pill-shaped UI.
- Use reduced-motion preferences and keep hover movement subtle.

## 4. Page structure and content plan

Build one complete homepage with anchored navigation in Phase 1. Each section should answer a different visitor question.

### A. Header and navigation

- Fluxora Studio wordmark
- Anchors: Services, Selected work, Process, Studio, Contact
- Primary action: “Discuss a project” or an equivalent approved label
- Sticky desktop header; compact accessible mobile menu
- Optional slim context line for location and capabilities, only if it improves clarity

### B. Hero and positioning

- Clear one-sentence positioning statement about building digital systems for businesses
- Supporting paragraph that names the four capabilities without jargon
- Primary contact action and secondary Services link
- One art-directed hero visual: an approved product photograph, original abstract systems visual, or genuine product interface image
- Keep the headline and main action visible early on both desktop and mobile

Content to confirm: final headline, exact description of Fluxora’s market, and preferred language. Recommended default is Bahasa Indonesia first, with an English version if international clients are an active priority.

### C. Studio introduction

A short statement about Fluxora’s role from understanding the workflow through building and supporting the software. Avoid unsupported claims about company size, years in business, delivery speed, or client results.

### D. Four capability areas

Present each offering as a distinct editorial block, not a generic feature list. Each block should include:

- The business situation it addresses
- What Fluxora can build
- A few representative capabilities
- One route back to the project conversation

Initial content outline:

| Service | Visitor problem to explain | Example capability areas |
|---|---|---|
| E-commerce | Customers and staff need a smoother path from discovery to fulfilment | Storefront, catalogue, checkout integrations, order and inventory workflows |
| AI assistants | Teams need faster answers or repeatable help across existing workflows | Customer support, internal knowledge, task automation, system integrations |
| ERP and logistics | Operations are spread across disconnected tools and handoffs | Inventory, order operations, warehouse/fulfilment workflows, reporting |
| E-ticketing | Events need a clear purchase and on-site entry experience | Ticket sales, attendee records, validation/check-in, event operations |

Treat these as examples for content development, not a promise that every integration or feature is already a packaged product. Confirm actual delivery scope before publishing.

### E. Selected work / proof

Use real, approved projects if Fluxora has case studies ready. For every entry, collect the client or project name, permission to publish, a short problem/solution summary, image rights, and any results that can be substantiated.

If this material is not ready, omit client logos, fabricated reviews, and invented performance metrics. A clearly labelled concept or product walkthrough can show the studio’s approach, but it must not be presented as a shipped client project.

### F. Why Fluxora / capabilities across the lifecycle

Explain the useful connection between strategy, design, engineering, and operational software in plain language. Keep this section to verifiable strengths and working practices. Do not add generic differentiators such as “best in class” or claims about team size, speed, or retention without evidence.

### G. Working process

Show a concise sequence, with real descriptions of the client’s role and the studio’s work:

1. **Understand** — goals, users, existing tools, constraints
2. **Shape** — scope, workflows, priorities, and a delivery plan
3. **Build** — design and implementation in reviewable increments
4. **Launch and improve** — release, handover, and any agreed follow-on support

Confirm that this reflects Fluxora’s actual engagement process before final copy is written.

### H. Engagement options

Describe only the engagement types Fluxora actually offers, such as a scoped project, ongoing product work, or technical consulting. Do not invent a subscription, free build, starting price, guarantee, or contract term. If commercial details are not approved, use a short “Let’s scope the right approach” contact panel instead of pricing cards.

### I. FAQ

Answer practical questions that reduce uncertainty. Draft topics for owner review:

- What kinds of systems does Fluxora build?
- How does a project begin?
- Can Fluxora extend an existing platform?
- How are scope, timeline, and cost determined?
- What happens after launch?
- Which information can a prospect share safely during an initial conversation?

Publish answers only after the studio confirms its policies and process.

### J. Contact and footer

- Strong closing project invitation
- Verified email, phone/WhatsApp, and any approved social links
- Location and service-area language only if confirmed
- Footer links for the four services, contact, and approved legal pages

The current `hello@fluxorastudio.id` mail link is unverified. Confirm the mailbox before relying on it as the primary contact path. Keep Phase 1 frontend-only; no contact API or backend hostname is needed unless a submitted lead form is specifically requested.

## 5. Content and asset inputs

Before implementation is considered complete, collect or approve:

- Final positioning statement and preferred site language(s)
- One-sentence and expanded descriptions for each service
- Verified business contact details and response expectations
- Approved client projects, testimonials, logos, and image permissions, if available
- Actual engagement models and support arrangements
- Answers to FAQ topics and any legal/footer links
- Any existing brand assets or typeface/licensing requirements

When no approved case study or photo exists, use an original supporting visual or an accurately labelled product concept. Do not use unverified client imagery or treat generated visuals as screenshots of real software.

## 6. Implementation approach

- Preserve the existing React, TypeScript, Vite, npm lockfile, Docker, Nginx, and GitHub Actions setup.
- Keep the page static and content-led; do not add a backend, database, CMS, or backend domain as part of this phase.
- Move repeated section content into small typed data arrays where that improves maintainability; split components only where it makes the page easier to edit.
- Define the color, typography, spacing, width, and border tokens centrally in the stylesheet.
- Replace the current dark/neon treatment with the approved editorial direction across the full page, including navigation, cards, focus states, mobile menu, and footer.
- Update page title, description, canonical URL, and favicon usage for `fluxorastudio.id`. Do not create social-preview imagery unless separately requested.
- Keep the existing environment mapping: `main` → `dev.fluxorastudio.id` on vm01 port `8093`; `prod` → `fluxorastudio.id` and `www.fluxorastudio.id` on port `8094`.

## 7. Responsive behavior and accessibility

- At wide widths, use asymmetric editorial sections and multi-column service/work layouts where the content supports them.
- At tablet widths, reduce columns without compressing text or removing service detail.
- At mobile widths, stack content in a deliberate reading order; keep the project CTA available from the menu and closing section.
- Support keyboard navigation, visible focus, meaningful headings, descriptive link labels, adequate contrast, and reduced motion.
- Avoid horizontal overflow at 320px and verify text enlargement to 200%.
- Give meaningful images useful alt text; mark purely decorative images and accents as decorative.

## 8. Delivery sequence

1. **Content lock:** confirm positioning, language, contact details, project evidence, and engagement model.
2. **Visual system:** define palette, type scale, spacing, surface rhythm, button and link states, and image treatment.
3. **Homepage implementation:** build the header, hero, four service areas, proof/work content, process, FAQ, contact, and footer.
4. **Responsive and accessibility pass:** check desktop/tablet/mobile, keyboard flow, contrast, reduced motion, and 200% text size.
5. **Local verification:** run the production build and manually inspect the page and asset loading.
6. **Development review:** deploy to `dev.fluxorastudio.id`; review content and presentation before promoting the same approved revision to `prod`.

## 9. Acceptance criteria

- The page presents Fluxora as a software studio and clearly explains all four requested service areas.
- The visual language feels editorial and elegant in the spirit of Nilam while using Fluxora’s distinct navy, porcelain, slate-blue, and brass palette.
- The information sequence helps visitors understand, evaluate, and contact the studio; each section adds distinct information.
- No invented client names, testimonials, statistics, pricing, guarantees, or delivery commitments appear.
- The contact action uses a verified address or an explicitly approved working channel.
- The site remains responsive, keyboard-usable, readable, and accessible with reduced motion.
- The existing static deployment works for both development and production without adding a backend service or DNS name.

## 10. Out of scope for Phase 1

- New backend/API, lead storage, CRM, CMS, authentication, or admin dashboard
- Pricing calculator or unapproved subscription packages
- Multilingual content management beyond the language(s) approved for the first release
- Individual service-detail pages, blog system, customer portal, or e-commerce functionality
- Claims, customer stories, or metrics that have not been verified by Fluxora
