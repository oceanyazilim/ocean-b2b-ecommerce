import type { ReactNode, SVGAttributes } from "react";

export type IconProps = SVGAttributes<SVGSVGElement> & { size?: number };

function makeIcon(paths: ReactNode, viewBox = "0 0 24 24") {
  return function Icon({ size = 18, className, ...props }: IconProps) {
    return (
      <svg
        viewBox={viewBox}
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={className}
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

// A small, hand-drawn set of line icons shared across admin/storefront nav — no external
// icon library dependency, so it never depends on network access during install.
export const HomeIcon = makeIcon(
  <>
    <path d="M3.5 10.5 12 3l8.5 7.5" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h3.5a1 1 0 0 0 1-1V9.5" />
  </>,
);

export const OrdersIcon = makeIcon(
  <>
    <path d="M6.5 8h11l1 12.5a1 1 0 0 1-1 1.1H6.5a1 1 0 0 1-1-1.1L6.5 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </>,
);

export const ProductsIcon = makeIcon(
  <>
    <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16V8Z" />
    <path d="M3.5 8 12 12.5 20.5 8" />
    <path d="M12 12.5V20.5" />
  </>,
);

export const CollectionsIcon = makeIcon(
  <>
    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
    <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
  </>,
);

export const InventoryIcon = makeIcon(
  <>
    <rect x="3.5" y="7" width="17" height="13.5" rx="1.5" />
    <path d="M3.5 11.5h17" />
    <path d="M8 7V5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 5v2" />
  </>,
);

export const CustomersIcon = makeIcon(
  <>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <path d="M16 4.3a3.25 3.25 0 0 1 0 6.4" />
    <path d="M15.5 14.2c2.6.5 4.5 2.9 4.5 5.8" />
  </>,
);

export const CompaniesIcon = makeIcon(
  <>
    <path d="M4 20.5V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15.5" />
    <path d="M15 10.5h4a1 1 0 0 1 1 1v9" />
    <path d="M7.5 7.5h1.5M7.5 11h1.5M7.5 14.5h1.5M11 7.5h1.5M11 11h1.5M11 14.5h1.5" />
    <path d="M4 20.5h16" />
  </>,
);

export const CatalogsIcon = makeIcon(
  <>
    <path d="M5 4.5h11a2 2 0 0 1 2 2V20l-3.2-2-3.2 2-3.2-2-3.2 2V6.5a2 2 0 0 1 2-2Z" />
    <path d="M8 9h7M8 12.5h7" />
  </>,
);

export const PricingIcon = makeIcon(
  <path d="M12 3.5v17M16.5 6.8c0-1.5-1.6-2.3-4-2.3-3 0-4.5 1.3-4.5 3s1.3 2.4 4.5 3.1c3.2.7 4.5 1.7 4.5 3.4 0 1.8-1.8 3-4.5 3-2.6 0-4.4-1-4.6-2.6" />,
);

export const QuotesIcon = makeIcon(
  <>
    <path d="M6 3.5h9l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M15 3.5V8h4" />
    <path d="M8.5 12.5h7M8.5 16h4.5" />
  </>,
);

export const StorefrontIcon = makeIcon(
  <>
    <path d="M3.5 9 5 4.5h14L20.5 9" />
    <path d="M3.5 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
    <path d="M5 9v10.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
    <path d="M9.5 20.5V15a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5.5" />
  </>,
);

export const AnalyticsIcon = makeIcon(
  <>
    <path d="M4 20.5V3.5" />
    <path d="M4 20.5h16.5" />
    <rect x="7" y="13" width="3" height="7.5" />
    <rect x="12.5" y="9" width="3" height="11.5" />
    <rect x="18" y="6" width="2.5" height="14.5" />
  </>,
);

export const SettingsIcon = makeIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2.06 2.06 0 1 1-2.92 2.92l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56v.17a2.06 2.06 0 1 1-4.12 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2.06 2.06 0 1 1-2.92-2.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4.6a2.06 2.06 0 1 1 0-4.12h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2.06 2.06 0 1 1 2.92-2.92l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1.03-1.56V4.6a2.06 2.06 0 1 1 4.12 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2.06 2.06 0 1 1 2.92 2.92l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.56 1.03h.17a2.06 2.06 0 1 1 0 4.12h-.09a1.7 1.7 0 0 0-1.56 1.03Z" />
  </>,
);

export const SearchIcon = makeIcon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>,
);

export const BellIcon = makeIcon(
  <>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </>,
);

export const ChevronDownIcon = makeIcon(<path d="m6 9 6 6 6-6" />);

export const ChevronRightIcon = makeIcon(<path d="m9 6 6 6-6 6" />);

export const MenuIcon = makeIcon(<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />);

export const CloseIcon = makeIcon(<path d="M6 6l12 12M18 6 6 18" />);

export const CartIcon = makeIcon(
  <>
    <circle cx="9.5" cy="20" r="1.25" />
    <circle cx="17.5" cy="20" r="1.25" />
    <path d="M3 4h2l2.2 11.1a2 2 0 0 0 2 1.6h8.1a2 2 0 0 0 1.96-1.6L20.5 8H6" />
  </>,
);

export const UserIcon = makeIcon(
  <>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" />
  </>,
);

export const PlusIcon = makeIcon(<path d="M12 4.5v15M4.5 12h15" />);

export const CheckIcon = makeIcon(<path d="m4.5 12.5 5 5 10-10.5" />);

export const LogoutIcon = makeIcon(
  <>
    <path d="M9 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" />
    <path d="M13 16l4.5-4L13 8" />
    <path d="M17.5 12H9" />
  </>,
);
