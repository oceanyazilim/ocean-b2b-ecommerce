import {
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  PanelLeft,
  Pin,
  Plus,
  Search,
  Settings as SettingsLucide,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tag,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { SVGAttributes } from "react";

export type IconProps = SVGAttributes<SVGSVGElement> & { size?: number };

// Wraps a Lucide icon so every icon in the design system shares one prop contract (size,
// className, ...svg attrs) regardless of the underlying icon set. Default size is 18px, matching
// the spec's 16/18/20px scale; strokeWidth 1.75 keeps icons visually consistent with the rest of
// the neutral, line-based visual language.
function wrap(LucideCmp: LucideIcon) {
  return function Icon({ size = 18, ...props }: IconProps) {
    return <LucideCmp size={size} strokeWidth={1.75} aria-hidden {...props} />;
  };
}

export const HomeIcon = wrap(Home);
export const OrdersIcon = wrap(ShoppingBag);
export const ProductsIcon = wrap(Package);
export const CollectionsIcon = wrap(LayoutGrid);
export const InventoryIcon = wrap(Boxes);
export const CustomersIcon = wrap(Users);
export const CompaniesIcon = wrap(Building2);
export const CatalogsIcon = wrap(BookOpen);
export const PricingIcon = wrap(Tag);
export const QuotesIcon = wrap(FileText);
export const StorefrontIcon = wrap(Store);
export const AnalyticsIcon = wrap(BarChart3);
export const SettingsIcon = wrap(SettingsLucide);
export const SearchIcon = wrap(Search);
export const BellIcon = wrap(Bell);
export const ChevronDownIcon = wrap(ChevronDown);
export const ChevronRightIcon = wrap(ChevronRight);
export const ChevronLeftIcon = wrap(ChevronLeft);
export const MenuIcon = wrap(Menu);
export const CloseIcon = wrap(X);
export const CartIcon = wrap(ShoppingCart);
export const UserIcon = wrap(User);
export const PlusIcon = wrap(Plus);
export const CheckIcon = wrap(Check);
export const LogoutIcon = wrap(LogOut);

// New in the Phase 1 redesign: sidebar collapse toggle and pinned-favorites / command palette
// "recent searches" affordances.
export const PanelLeftIcon = wrap(PanelLeft);
export const PinIcon = wrap(Pin);
export const ClockIcon = wrap(Clock);
