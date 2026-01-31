"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { Button, Card, useAppForm } from "~/components/ui";
import { api } from "../../../../convex/_generated/api";

const campaignSchema = z.object({
  name: z.string().min(1, "Name is required"),
  thesis: z.string().min(1, "Thesis is required"),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

export default function NewCampaignPage() {
  const router = useRouter();
  const createCampaign = useMutation(api.campaigns.createCampaign);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setIsSubmitting(true);
      setErrorMessage(null);
      try {
        const parsed = campaignSchema.parse(value);
        const campaignId = await createCampaign({
          name: parsed.name,
          thesis: parsed.thesis,
        });
        setSuccessMessage("Campaign created successfully!");
        setTimeout(() => {
          router.push(`/campaigns/${campaignId}`);
        }, 1000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create campaign";
        setErrorMessage(message);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">New Campaign</h1>

      {successMessage && (
        <div className="text-slate-12 mb-4 rounded-md bg-green-900/50 p-4">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="text-slate-12 mb-4 flex items-center justify-between rounded-md bg-red-900/50 p-4">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-slate-12 ml-4 hover:text-white"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
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
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => router.push("/campaigns")}
                  dataTestId="cancel-button"
                >
                  Cancel
                </Button>
                <form.SubmitButton
                  label={isSubmitting ? "Creating..." : "Create Campaign"}
                />
              </form.AppForm>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
