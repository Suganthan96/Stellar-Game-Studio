import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZK-UNO — Zero-Knowledge UNO on Stellar',
  description: 'Play UNO with hidden hands powered by RISC Zero zero-knowledge proofs on Stellar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#1a1a2e] text-white">
        {children}
      </body>
    </html>
  );
}
