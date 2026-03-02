"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Alert, Button, Card, useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";

const campaignSchema = z.object({
  name: z.string().min(1, "Name is required"),
  thesis: z.string().min(1, "Thesis is required"),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

export default function NewCampaignPage() {
  const router = useRouter();
  const createCampaign = useMutation(api.campaigns.createCampaign);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const form = useAppForm({
    defaultValues: {
      name: "",
      thesis: "",
    } satisfies CampaignFormData,
    validators: {
      onChange: ({ value }) => {
        const results = campaignSchema.safeParse(value);
        if (!results.success) {
          return results.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setErrorMessage(null);
      try {
        const parsed = campaignSchema.parse(value);
        const campaignId = await createCampaign({
          name: parsed.name,
          thesis: parsed.thesis,
        });
        setSuccessMessage("Campaign created successfully!");
        redirectTimeoutRef.current = setTimeout(() => {
          router.push(`/campaigns/${campaignId}`);
        }, 1000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create campaign";
        setErrorMessage(message);
      }
    },
  });

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">New Campaign</h1>

      {successMessage && (
        <Alert variant="success" className="mb-4">
          {successMessage}
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="error" className="mb-4" onDismiss={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      <Card className="bg-slate-800 p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <div className="flex flex-col gap-6">
            <form.AppField name="name">
              {(field) => (
                <field.FieldInput
                  label="Campaign Name"
                  placeholder="e.g. Gold Bull Run Q1 2026"
                />
              )}
            </form.AppField>

            <form.AppField name="thesis">
              {(field) => (
                <field.FieldTextarea
                  label="Thesis"
                  placeholder="Describe your trading thesis for this campaign..."
                  rows={5}
                />
              )}
            </form.AppField>

            <div className="flex justify-end gap-3 pt-4">
              <form.AppForm>
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting || successMessage !== null}
                      onClick={() => {
                        if (redirectTimeoutRef.current) {
                          clearTimeout(redirectTimeoutRef.current);
                        }
                        router.push("/campaigns");
                      }}
                      dataTestId="cancel-button"
                    >
                      Cancel
                    </Button>
                  )}
                </form.Subscribe>
                <form.SubmitButton label="Create Campaign" />
              </form.AppForm>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
