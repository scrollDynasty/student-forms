// Lucide icons with the Organic look (stroke 2.75). Decorative by default: aria-hidden, not focusable.
import {
  ArrowDown,
  ArrowUp,
  ChartColumn,
  Check,
  ChevronLeft,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Inbox,
  Info,
  Link,
  Monitor,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

type IconProps = Omit<LucideProps, 'ref'>;

function organic(Glyph: LucideIcon) {
  return function OrganicIcon({ size = 18, ...rest }: IconProps) {
    return <Glyph size={size} strokeWidth={2.75} aria-hidden="true" focusable="false" {...rest} />;
  };
}

export const IconPlus = organic(Plus);
export const IconArrowUp = organic(ArrowUp);
export const IconArrowDown = organic(ArrowDown);
export const IconChevronLeft = organic(ChevronLeft);
export const IconChevronUp = organic(ChevronUp);
export const IconCopy = organic(Copy);
export const IconTrash = organic(Trash2);
export const IconLink = organic(Link);
export const IconExternal = organic(ExternalLink);
export const IconCheck = organic(Check);
export const IconX = organic(X);
export const IconRefresh = organic(RefreshCw);
export const IconDownload = organic(Download);
export const IconMonitor = organic(Monitor);
export const IconPhone = organic(Smartphone);
export const IconInfo = organic(Info);
export const IconAlert = organic(TriangleAlert);
export const IconInbox = organic(Inbox);
export const IconChart = organic(ChartColumn);
export const IconForm = organic(FileText);
