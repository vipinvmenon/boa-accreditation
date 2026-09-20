'use client'

import type { SVGProps } from 'react'

export type IconName =
  | 'arrow-right'
  | 'arrow-up-right'
  | 'caret-down'
  | 'check'
  | 'download-simple'
  | 'magnifying-glass'
  | 'moon'
  | 'paper-plane-tilt'
  | 'plus'
  | 'printer'
  | 'scan'
  | 'sort-descending'
  | 'sun'
  | 'x'

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  name: IconName
}

export function Icon({ name, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="1em"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 256 256"
      width="1em"
      {...props}
    >
      {name === 'arrow-right' && <path d="M40 128h176M144 56l72 72-72 72" />}
      {name === 'arrow-up-right' && <path d="M56 200 200 56M96 56h104v104" />}
      {name === 'caret-down' && <path d="m48 96 80 80 80-80" />}
      {name === 'check' && <path d="m40 144 56 56L216 80" />}
      {name === 'download-simple' && <path d="M128 40v128M80 120l48 48 48-48M40 200h176" />}
      {name === 'magnifying-glass' && (
        <>
          <circle cx="116" cy="116" r="76" />
          <path d="m170 170 54 54" />
        </>
      )}
      {name === 'moon' && <path d="M216 144a88 88 0 0 1-104-104 88 88 0 1 0 104 104Z" />}
      {name === 'paper-plane-tilt' && (
        <>
          <path d="m232 40-88 176-40-80-80-40Z" />
          <path d="M104 136 232 40" />
        </>
      )}
      {name === 'plus' && <path d="M40 128h176M128 40v176" />}
      {name === 'printer' && <path d="M72 96V40h112v56M72 184H40V104h176v80h-32M72 152h112v64H72z" />}
      {name === 'scan' && (
        <path d="M88 40H56a16 16 0 0 0-16 16v32M168 40h32a16 16 0 0 1 16 16v32M88 216H56a16 16 0 0 1-16-16v-32M168 216h32a16 16 0 0 0 16-16v-32M80 80h96v96H80z" />
      )}
      {name === 'sort-descending' && <path d="M40 64h176M40 128h128M40 192h80" />}
      {name === 'sun' && (
        <>
          <circle cx="128" cy="128" r="48" />
          <path d="M128 24v24M128 208v24M232 128h-24M48 128H24M201.5 54.5l-17 17M71.5 184.5l-17 17M201.5 201.5l-17-17M71.5 71.5l-17-17" />
        </>
      )}
      {name === 'x' && <path d="m64 64 128 128M192 64 64 192" />}
    </svg>
  )
}
