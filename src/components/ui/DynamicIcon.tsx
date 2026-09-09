"use client";

import React from "react";
import {
  Zap,
  Droplets,
  Building2,
  Home,
  Mail,
  MessageSquare,
  Lock,
  Unlock,
  Shield,
  Mic,
  Settings,
  ClipboardList,
  FileText,
  Receipt,
  CreditCard,
  Landmark,
  Search,
  Trash2,
  Edit3,
  Plus,
  RefreshCw,
  BarChart3,
  TrendingUp,
  FlaskConical,
  Wand2,
  Sparkles,
  Bot,
  Dna,
  Clock,
  Calendar,
  Timer,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Info,
  PartyPopper,
  Gift,
  Smartphone,
  Gem,
  Wrench,
  Target,
  Lightbulb,
  Download,
  Upload,
  Link2,
  Image as ImageIcon,
  Folder,
  Tag,
  Pin,
  Eraser,
  Rocket,
  Globe,
  FileEdit,
  Scale,
  MapPin,
  Puzzle,
  BookOpen,
  Hand,
  Briefcase,
  Activity,
  Utensils,
  Coins,
  Users,
  Car,
  Smile,
  Moon,
  Frown,
  Square,
  Hourglass,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Copy,
  ExternalLink,
  Filter,
  Sliders,
  Play,
  ArrowRight,
  Eye,
  EyeOff,
  Menu,
  FileSpreadsheet,
  LucideIcon,
} from "lucide-react";

export const EMOJI_TO_LUCIDE: Record<string, LucideIcon> = {
  // Electricity / Energy
  "⚡": Zap,
  zap: Zap,

  // Water / Utilities
  "💧": Droplets,
  droplets: Droplets,
  droplet: Droplets,

  // Buildings / Real estate
  "🏢": Building2,
  building: Building2,
  building2: Building2,
  "🏠": Home,
  home: Home,

  // Mail & Communication
  "✉️": Mail,
  "📧": Mail,
  "📬": Mail,
  mail: Mail,
  email: Mail,
  "💬": MessageSquare,
  messagesquare: MessageSquare,
  sms: MessageSquare,
  chat: MessageSquare,

  // Security
  "🔒": Lock,
  "🔐": Lock,
  lock: Lock,
  "🔓": Unlock,
  unlock: Unlock,
  "🛡️": Shield,
  shield: Shield,

  // Audio / Recording
  "🎙️": Mic,
  mic: Mic,
  microphone: Mic,

  // Settings / Tools
  "⚙️": Settings,
  settings: Settings,
  "🛠️": Wrench,
  wrench: Wrench,
  "🧹": Eraser,
  eraser: Eraser,

  // Documents & Lists
  "📋": ClipboardList,
  clipboard: ClipboardList,
  clipboardlist: ClipboardList,
  "📄": FileText,
  filetext: FileText,
  document: FileText,
  "📜": FileText,
  "🧾": Receipt,
  receipt: Receipt,
  "📝": FileEdit,
  fileedit: FileEdit,
  "📑": FileSpreadsheet,
  "📂": Folder,
  "📁": Folder,
  folder: Folder,

  // Finance
  "💳": CreditCard,
  creditcard: CreditCard,
  card: CreditCard,
  "🏦": Landmark,
  landmark: Landmark,
  bank: Landmark,
  "💰": Coins,
  coins: Coins,
  money: Coins,

  // Search & Actions
  "🔍": Search,
  search: Search,
  "🗑️": Trash2,
  trash: Trash2,
  trash2: Trash2,
  "✏️": Edit3,
  "✎": Edit3,
  edit: Edit3,
  edit3: Edit3,
  "➕": Plus,
  plus: Plus,
  "🔄": RefreshCw,
  refresh: RefreshCw,
  refreshcw: RefreshCw,
  "📥": Download,
  download: Download,
  "📤": Upload,
  upload: Upload,
  "🔗": Link2,
  link: Link2,
  link2: Link2,

  // Charts & Analytics
  "📊": BarChart3,
  barchart: BarChart3,
  barchart3: BarChart3,
  "📈": TrendingUp,
  trendingup: TrendingUp,
  "⚖️": Scale,
  scale: Scale,

  // AI & Tech
  "🧪": FlaskConical,
  flask: FlaskConical,
  flaskconical: FlaskConical,
  sandbox: FlaskConical,
  "🪄": Wand2,
  wand: Wand2,
  wand2: Wand2,
  "✨": Sparkles,
  sparkles: Sparkles,
  "🤖": Bot,
  bot: Bot,
  ai: Bot,
  "🧬": Dna,
  dna: Dna,
  "🚀": Rocket,
  rocket: Rocket,
  "🌐": Globe,
  globe: Globe,
  "🧩": Puzzle,
  puzzle: Puzzle,

  // Time & Dates
  "🕒": Clock,
  clock: Clock,
  "⏱️": Timer,
  timer: Timer,
  "📅": Calendar,
  "🗓️": Calendar,
  calendar: Calendar,
  "⏳": Hourglass,
  hourglass: Hourglass,

  // Alerts & Status
  "🚨": AlertTriangle,
  "⚠️": AlertTriangle,
  warning: AlertTriangle,
  alerttriangle: AlertTriangle,
  "✅": CheckCircle2,
  checkcircle: CheckCircle2,
  checkcircle2: CheckCircle2,
  "❌": XCircle,
  xcircle: XCircle,
  "✓": Check,
  check: Check,
  "✕": X,
  x: X,
  close: X,
  "ℹ️": Info,
  info: Info,

  // Misc items
  "🎉": PartyPopper,
  partypopper: PartyPopper,
  "🎁": Gift,
  gift: Gift,
  "📱": Smartphone,
  smartphone: Smartphone,
  mobile: Smartphone,
  "💍": Gem,
  gem: Gem,
  "🎯": Target,
  target: Target,
  "💡": Lightbulb,
  lightbulb: Lightbulb,
  "🖼️": ImageIcon,
  image: ImageIcon,
  "🏷️": Tag,
  tag: Tag,
  "📌": Pin,
  pin: Pin,
  "📍": MapPin,
  mappin: MapPin,
  "📚": BookOpen,
  "📖": BookOpen,
  "📔": BookOpen,
  book: BookOpen,
  bookopen: BookOpen,

  // Life timeline categories
  "💼": Briefcase,
  briefcase: Briefcase,
  work: Briefcase,
  "🏃": Activity,
  activity: Activity,
  fitness: Activity,
  "🍽️": Utensils,
  utensils: Utensils,
  food: Utensils,
  "👥": Users,
  users: Users,
  social: Users,
  "🚗": Car,
  car: Car,
  travel: Car,
  "🧘": Smile,
  reflection: Smile,
  "✋": Hand,
  hand: Hand,
  manual: Hand,

  // Moods & Playback
  "😊": Smile,
  smile: Smile,
  "😴": Moon,
  moon: Moon,
  "😰": Frown,
  frown: Frown,
  "⏹️": Square,
  square: Square,
  stop: Square,
  "▶️": Play,
  play: Play,
  "▲": ChevronUp,
  chevronup: ChevronUp,
  "▼": ChevronDown,
  chevrondown: ChevronDown,
  "☰": Menu,
  menu: Menu,
};

interface DynamicIconProps extends Omit<React.SVGProps<SVGSVGElement>, "name"> {
  icon?: string | null;
  name?: string | null;
  className?: string;
  size?: number;
}

export function DynamicIcon({
  icon,
  name,
  className = "w-4 h-4",
  size,
  ...props
}: DynamicIconProps) {
  const key = (icon || name || "").trim();
  if (!key) return null;

  // Direct lookup
  let IconComponent = EMOJI_TO_LUCIDE[key] || EMOJI_TO_LUCIDE[key.toLowerCase()];

  // If not found directly, try stripping emoji variations or whitespace
  if (!IconComponent) {
    const cleanedKey = key.replace(/[\uFE0E\uFE0F]/g, "").trim();
    IconComponent = EMOJI_TO_LUCIDE[cleanedKey] || EMOJI_TO_LUCIDE[cleanedKey.toLowerCase()];
  }

  // Fallback to Tag
  if (!IconComponent) {
    return <Tag className={className} width={size} height={size} {...props} />;
  }

  return <IconComponent className={className} width={size} height={size} {...props} />;
}
