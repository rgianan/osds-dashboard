import { createContext } from 'react'

// The app shell owns the phone menu; each page's header reads this to open it.
export const NavContext = createContext({ menuOpen: false, openMenu: () => {} })
