type IconName =
  | "orders"
  | "list"
  | "tables"
  | "kitchen"
  | "menu"
  | "logout"
  | "plus"
  | "minus"
  | "search"
  | "back"
  | "check"
  | "card"
  | "cash"
  | "qr"
  | "split"
  | "print"
  | "guests"
  | "user"
  | "trash"
  | "edit"
  | "copy"
  | "alert"
  | "close"
  | "send";

const PATHS: Record<IconName, React.ReactNode> = {
  orders: (<><path d="M6 2h12l1 4H5z" /><path d="M5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6" /><path d="M9 11h6M9 15h4" /></>),
  list: (<><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>),
  tables: (<><rect x="3" y="7" width="18" height="6" rx="1.5" /><path d="M6 13v7M18 13v7M9 4h6" /></>),
  kitchen: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1.5 1 3 2.5 3 5" />,
  menu: (<><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" /><path d="M8 9h6M8 13h4" /></>),
  logout: (<><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 17l5-5-5-5M15 12H3" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  search: (<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>),
  back: <path d="M15 6l-6 6 6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  card: (<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></>),
  cash: (<><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.8" /><path d="M6 9.5v5M18 9.5v5" /></>),
  qr: (<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h7v-4M17.5 17.5v.01" /></>),
  split: (<><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M2.5 20a5.5 5.5 0 0 1 11 0M10.5 20a5.5 5.5 0 0 1 11 0" /></>),
  print: (<><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2" /><rect x="6" y="14" width="12" height="7" /></>),
  guests: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  edit: (<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>),
  copy: (<><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>),
  alert: (<><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.5" /></>),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  send: (<><path d="M4 12l16-8-6 16-3-7z" /><path d="M11 13l9-9" /></>),
};

export function Icon({ name, size = 20, stroke = 1.9, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
