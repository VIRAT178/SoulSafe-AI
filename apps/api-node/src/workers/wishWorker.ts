import { getDueWishCapsules, ackScheduledWish } from "../services/queue.js";
import { getCapsuleById, markWishCapsulePendingApproval, recordAuditLog, findUserById } from "../services/repository.js";
import { sendWishCapsule } from "../services/wishService.js";
import { sendCreatorNotificationEmail } from "../services/emailService.js";

const WISH_POLL_INTERVAL_MS = 2000;

export function startWishWorker(): void {
  setInterval(async () => {
    try {
      const due = await getDueWishCapsules(50);
      for (const capsuleId of due) {
        try {
          const capsule = await getCapsuleById(capsuleId);
          if (!capsule) {
            await ackScheduledWish(capsuleId);
            continue;
          }

          if (capsule.deliveryMode === "manual_approval") {
            const pending = await markWishCapsulePendingApproval(capsuleId);
            await recordAuditLog({
              capsuleId,
              userId: capsule.userId,
              action: "wish_pending_approval",
              category: "wish_capsule",
              status: pending?.status || capsule.status,
              details: { reason: "Reached scheduled time" }
            });
            try {
              const owner = await findUserById(capsule.userId);
              if (owner) {
                await sendCreatorNotificationEmail({
                  to: owner.email,
                  creatorName: owner.fullName,
                  recipientName: capsule.recipient?.name || "recipient",
                  sentAt: new Date(),
                  occasionType: capsule.occasionType || "custom"
                });
              }
            } catch (err) {
              // best-effort
            }

            await ackScheduledWish(capsuleId);
            continue;
          }

          // attempt send
          const result = await sendWishCapsule(capsuleId, { source: "scheduler" });
          // regardless of result, remove from schedule to avoid duplicates; sendWishCapsule handles rate/lock
          await ackScheduledWish(capsuleId);
        } catch (err) {
          console.error("Failed processing scheduled wish", err);
        }
      }
    } catch (error) {
      console.error("Wish worker failed", error);
    }
  }, WISH_POLL_INTERVAL_MS);
}
