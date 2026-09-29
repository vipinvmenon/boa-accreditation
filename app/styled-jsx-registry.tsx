'use client'

/**
 * Without this, every `<style jsx>` block (master, orgs, users, gate,
 * vehicle) is missing from the server HTML: the markup arrives with its
 * `jsx-…` class names but no rules, renders unstyled, and snaps into
 * place on hydration — a 0.5 layout shift on /desk/users before any data
 * has loaded. This collects the rules during the server render and writes
 * them into the stream ahead of the markup that uses them.
 * node_modules/next/dist/docs/01-app/02-guides/css-in-js.md, "styled-jsx".
 */
import { useState } from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'

export function StyledJsxRegistry({ children }: { children: React.ReactNode }) {
  const [registry] = useState(() => createStyleRegistry())

  useServerInsertedHTML(() => {
    const styles = registry.styles()
    registry.flush()
    return <>{styles}</>
  })

  return <StyleRegistry registry={registry}>{children}</StyleRegistry>
}
