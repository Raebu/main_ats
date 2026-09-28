# Raeburn Talent design system

The platform uses shared tokens and primitives from `@raeburn/ui`. Careers and Talent Admin may have different visual expressions, but share accessibility and interaction behaviour.

## Principles

- WCAG 2.2 AA target.
- Keyboard-first controls and visible focus states.
- Responsive layouts with no essential information hidden on mobile.
- Semantic form labels, table headers and status text.
- Reduced-motion support.
- Consistent status semantics: neutral, success, warning and danger.
- Reusable `PageHeader`, `Card`, `Button`, `Badge` and `EmptyState` primitives.
- Shared `FormField`, `Input`, `DataTable`, `Drawer`, `Modal`, `Toast` and `BarChart` components.
- Product-specific components should compose shared primitives rather than duplicate interaction behaviour.

## Storybook

Stage 11 includes an actual Storybook workspace, rather than treating an application route as a substitute for Storybook.

Run locally:

```bash
npm run storybook
```

Build the static catalogue:

```bash
npm run storybook:build
```

The commands pin Storybook and the Next.js Vite framework adapter to `10.6.0`. CI builds the static catalogue on every deterministic validation run. Stories live beside `@raeburn/ui` in `packages/ui/src/components.stories.jsx` and cover controls, forms, tables, drawers, modals, notifications/toasts, empty states and charts.

The Talent Admin `/design-system` route remains the in-product reference for administrators. Storybook is the design-system development, review and regression catalogue.

## Stage 11 status

Stage 11 provides production primitives for controls, forms, cards, tables, drawers, modals, notifications/toasts, badges, states and charts, with Storybook as the component workshop and CI-buildable catalogue.

Future design-system expansion is product-led rather than a Stage 11 blocker: comboboxes, pagination, date/time controls and accessible drag/drop abstractions should be added when a concrete workflow requires them rather than as unused primitives.
