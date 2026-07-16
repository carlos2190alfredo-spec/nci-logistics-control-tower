import { Mail, MessageCircle, Monitor } from "lucide-react";
import { notificationChannelLabel } from "@/lib/ui/status";
import { formatDateShort } from "@/lib/utils";
import type { NotificationDelivery } from "@/generated/prisma";

const channelIcon = {
  PORTAL: Monitor,
  EMAIL: Mail,
  MOCK_WHATSAPP: MessageCircle,
} as const;

export function ActivityItem({ notification }: { notification: NotificationDelivery }) {
  const ChannelIcon = channelIcon[notification.channel];
  return (
    <div className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
      <span
        aria-hidden
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
      >
        <ChannelIcon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{notification.subject}</p>
        <p className="text-xs text-faint-foreground">
          {notificationChannelLabel[notification.channel]} ·{" "}
          <span className="tabular-nums">{formatDateShort(notification.createdAt)}</span>
        </p>
      </div>
    </div>
  );
}
