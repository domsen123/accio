export default defineAppConfig({
  ui: {
    colors: {
      // Brand: maps to the custom accio-yellow palette defined in main.css
      primary: 'accio-yellow',

      // Reserved — currently unused. Available if a future feature
      // genuinely needs a non-brand emphasis color.
      // Update DESIGN.md before using.
      secondary: 'sky',

      // Semantic state colors
      success: 'emerald', // verified entries, completed todos, vault unlocked
      info: 'sky', // informational badges, neutral notifications
      warning: 'amber', // drafts, almost-due todos, expiring sessions
      error: 'rose', // validation errors, destructive actions, locked states

      // Neutrals for text, surfaces, borders
      neutral: 'zinc',
    },
    input: {
      slots: {
        root: 'w-full',
      },
    },
    textarea: {
      slots: {
        root: 'w-full',
      },
    },
    select: {
      slots: {
        base: 'w-full',
      },
    },
    selectMenu: {
      slots: {
        base: 'w-full',
      },
    },
    badge: {
      slots: {
        base: 'font-mono',
      },
    },
  },
})
