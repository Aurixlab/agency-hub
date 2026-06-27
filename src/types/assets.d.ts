import type { StaticImageData } from 'next/image';

declare module '*.png' {
  const content: StaticImageData;
  export default content;
}

declare module 'react' {
  interface StyleHTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
