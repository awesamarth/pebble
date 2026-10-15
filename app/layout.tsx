import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Pebble — a little more on your side', description: 'Meet your very own little assistant. Make a Pebble that feels like you.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
