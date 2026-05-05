export default defineAppConfig({
  ui: {
    colors: {
      primary: 'bnb', // Binance yellow — #F0B90B
      secondary: 'bnbgreen', // Buy green — #0ECB81
      success: 'bnbgreen',
      info: 'sky',
      warning: 'bnb', // yellow doubles as warning
      error: 'bnbred', // Sell red — #F6465D
      neutral: 'bnbgray',
    },

    button: {
      defaultVariants: {
        color: 'primary',
        variant: 'solid',
        size: 'sm',
      },
      slots: {
        base: 'font-semibold uppercase tracking-wide',
      },
    },

    badge: {
      defaultVariants: {
        variant: 'soft',
        size: 'sm',
      },
      slots: {
        base: 'font-mono',
      },
    },

    card: {
      defaultVariants: {
        variant: 'subtle',
      },
    },

    input: {
      defaultVariants: {
        variant: 'outline',
        size: 'sm',
      },
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

    table: {
      slots: {
        th: 'px-4 py-3.5 text-xs text-muted font-semibold uppercase tracking-wide text-left rtl:text-right',
        td: 'p-4 text-sm text-muted whitespace-nowrap',
      },
    },
  },
})
