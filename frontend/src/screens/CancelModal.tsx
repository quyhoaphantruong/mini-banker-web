import { TEST_IDS, type MandateDetailDto } from "@mbd/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ApiError } from "../api/client";
import { useApi } from "../api/context";
import { Alert } from "../components/feedback";

function describeFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "This agreement can no longer be cancelled because its status has changed. Refresh and check the latest.";
  }
  return "The agreement could not be cancelled. Try again. Retrying is safe and will not cancel it twice.";
}

/**
 * Mounted only while open, so the key is minted once per opening and every retry reuses it.
 * The server answers a repeated key with the first result instead of cancelling twice.
 */
export function CancelModal({
  mandate,
  onClose,
}: {
  mandate: MandateDetailDto;
  onClose: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const dismissRef = useRef<HTMLButtonElement>(null);

  const cancel = useMutation({
    mutationFn: () => api.cancelMandate(mandate.mandateId, idempotencyKey),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["mandate", mandate.mandateId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["mandate-events", mandate.mandateId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["mandate-transactions", mandate.mandateId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["mandates", mandate.capId],
        }),
      ]);
      onClose();
    },
  });

  useEffect(() => {
    const opener = document.activeElement;
    dismissRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !cancel.isPending) onClose();
  };

  return (
    <div className="modal-backdrop" onKeyDown={onKeyDown}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        aria-describedby="cancel-body"
        className="modal"
      >
        <h2 id="cancel-title">Cancel agreement</h2>
        <p id="cancel-body">
          Cancel the PayTo agreement with <strong>{mandate.initiator}</strong>?
          This cannot be undone.
        </p>
        {cancel.isError && <Alert>{describeFailure(cancel.error)}</Alert>}
        <div className="row row-end">
          <button
            ref={dismissRef}
            type="button"
            className="btn"
            data-testid={TEST_IDS.cancelDismissButton}
            disabled={cancel.isPending}
            onClick={onClose}
          >
            Keep agreement
          </button>
          <button
            type="button"
            className="btn btn-danger"
            data-testid={TEST_IDS.cancelConfirmButton}
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending
              ? "Cancelling"
              : cancel.isError
                ? "Retry cancel"
                : "Cancel agreement"}
          </button>
        </div>
      </div>
    </div>
  );
}
