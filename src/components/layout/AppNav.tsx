'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/components/session/SessionProvider';

const LINKS = [
  { href: '/', label: 'Work orders', roles: ['Admin', 'Captain', 'Crew'] },
  { href: '/admin/users', label: 'Users', roles: ['Admin'] },
  { href: '/admin/vessels', label: 'Vessels', roles: ['Admin'] },
  { href: '/admin/assignments', label: 'Assignments', roles: ['Admin'] },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const { activeUser } = useSession();
  const links = LINKS.filter((l) => (l.roles as readonly string[]).includes(activeUser?.role ?? ''));
  if (links.length < 2) return null;

  return (
    <nav aria-label="Main" className="border-b border-slate-200 bg-white">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 sm:px-4">
        {links.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium ${
                  active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
