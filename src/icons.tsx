import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleUser,
  Cloud,
  Code,
  Copy,
  Eye,
  EyeOff,
  Key,
  Lightbulb,
  Link,
  Lock,
  Maximize2,
  MessageCircle,
  MessagesSquare,
  Mic,
  MoreHorizontal,
  Pencil,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  Settings,
  Share2,
  Smartphone,
  Sparkles,
  Trash2,
  User,
  UserPlus,
  Users,
  Volume2,
  X,
  XCircle,
  Zap,
} from "lucide-react";

function make(Icon: ComponentType<LucideProps>) {
  return function WrappedIcon(props: LucideProps) {
    return <Icon {...props} />;
  };
}

export const IoChatbubbles = make(MessagesSquare);
export const IoChatbubbleOutline = make(MessageCircle);
export const IoCube = make(Box);
export const IoPersonCircle = make(CircleUser);
export const IoSettings = make(Settings);

export const IoChevronBack = make(ChevronLeft);
export const IoChevronForward = make(ChevronRight);

export const IoPeopleOutline = make(Users);
export const IoPersonOutline = make(User);
export const IoPerson = make(User);
export const IoPersonAddOutline = make(UserPlus);

export const IoCaretDown = make(ChevronDown);
export const IoCaretUp = make(ChevronUp);

export const IoShareOutline = make(Share2);
export const IoCreateOutline = make(Pencil);
export const IoSearchOutline = make(Search);
export const IoCloseCircle = make(XCircle);
export const IoCloseOutline = make(X);
export const IoClose = make(X);

export const IoSparkles = make(Sparkles);
export const IoArrowDown = make(ArrowDown);

export const IoAddCircleOutline = make(PlusCircle);
export const IoTrashOutline = make(Trash2);
export const IoAdd = make(Plus);

export const IoCopyOutline = make(Copy);
export const IoRefreshOutline = make(RefreshCw);
export const IoVolumeMediumOutline = make(Volume2);
export const IoAnalyticsOutline = make(BarChart3);
export const IoMicOutline = make(Mic);

export const IoLinkOutline = make(Link);
export const IoKeyOutline = make(Key);
export const IoEyeOutline = make(Eye);
export const IoEyeOffOutline = make(EyeOff);
export const IoLockClosed = make(Lock);
export const IoCheckmarkCircle = make(CheckCircle2);
export const IoConstructOutline = make(Settings);
export const IoBulbOutline = make(Lightbulb);
export const IoPulseOutline = make(Activity);

export const IoEllipsisHorizontal = make(MoreHorizontal);
export const IoCodeSlashOutline = make(Code);
export const IoExpandOutline = make(Maximize2);

// Backwards-compat name used in some places
export const IoArrowUp = make(ArrowUp);
export const IoCloudOutline = make(Cloud);
export const IoFlashOutline = make(Zap);
export const IoPhonePortraitOutline = make(Smartphone);
