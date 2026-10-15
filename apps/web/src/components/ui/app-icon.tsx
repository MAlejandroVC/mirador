// DL-ICO-05: the Coin stacks icon on a white tile, or on a near-black one in dark mode.
// Both are in the page and CSS shows the one that matches the mode in use, so it follows
// the Appearance setting as well as the device (index.css, `.app-icon-*`).
export function AppIcon({ className }: { className: string }) {
  return (
    <>
      <img src="/favicon.svg" alt="" className={`app-icon-light ${className}`} />
      <img src="/app-icon-dark.svg" alt="" className={`app-icon-dark ${className}`} />
    </>
  )
}
