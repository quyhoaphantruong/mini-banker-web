import { TEST_IDS, type CapId } from "@mbd/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { useApi } from "../api/context";
import { Alert, Spinner } from "../components/feedback";

const CRN_PATTERN = /^\d{9}$/;

class CustomerNotFound extends Error {}

export function SearchScreen({ onFound }: { onFound: (capId: CapId) => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [crn, setCrn] = useState("");
  const [invalid, setInvalid] = useState(false);

  // Same two steps as BDS: search returns capIds, then the first one is fetched.
  const search = useMutation({
    mutationFn: async (value: string) => {
      const { capIds } = await api.search(value);
      const capId = capIds[0];
      if (!capId) throw new CustomerNotFound();
      const customer = await api.customer(capId);
      queryClient.setQueryData(["customer", capId], customer);
      return capId;
    },
    onSuccess: onFound,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = crn.trim();
    if (!CRN_PATTERN.test(value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    search.mutate(value);
  };

  const notFound =
    search.error instanceof CustomerNotFound ||
    (search.error instanceof ApiError && search.error.status === 404);

  return (
    <section aria-labelledby="search-heading" className="card search-card">
      <h2 id="search-heading">Find a customer</h2>
      <form onSubmit={submit} noValidate>
        <label htmlFor="crn" className="field-label">
          Customer Reference Number (CRN)
        </label>
        <div className="row">
          <input
            id="crn"
            data-testid={TEST_IDS.crnInput}
            inputMode="numeric"
            autoComplete="off"
            maxLength={9}
            value={crn}
            aria-invalid={invalid}
            aria-describedby="crn-hint"
            onChange={(e) => setCrn(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            data-testid={TEST_IDS.searchButton}
            disabled={search.isPending}
          >
            Search
          </button>
        </div>
        <p id="crn-hint" className={invalid ? "hint hint-error" : "hint"}>
          Enter the 9 digit CRN.
        </p>
      </form>
      {search.isPending && <Spinner label="Searching" />}
      {search.isError && (
        <Alert testId={TEST_IDS.errorBanner}>
          {notFound
            ? `No customer found for CRN ${crn.trim()}. Check the number and try again.`
            : "System not available. We could not complete the search. Please try again."}
        </Alert>
      )}
    </section>
  );
}
