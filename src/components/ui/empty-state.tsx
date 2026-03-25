"use client";

import Link from "next/link";
import { Button } from "./button";
import { Card, CardContent } from "./card";

export interface EmptyStateProps {
  /** Required stable test id. */
  dataTestId: string;
  /** Short, calm description of what will appear here. */
  description: string;
  /** Optional CTA button href. */
  ctaHref?: string;
  /** Optional CTA button label. */
  ctaLabel?: string;
  /** Optional CTA button click handler. */
  onCtaClick?: () => void;
  /** Optional CTA button test id. */
  ctaTestId?: string;
  /** Primary heading. */
  title: string;
}

function EmptyState({
  ctaHref,
  ctaLabel,
  ctaTestId,
  dataTestId,
  description,
  onCtaClick,
  title,
}: EmptyStateProps) {
  const ctaElement = ctaLabel ? (
    ctaHref ? (
      <Button
        asChild
        dataTestId={ctaTestId ?? `${dataTestId}-cta`}
        variant="default"
        className="mt-3"
      >
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    ) : onCtaClick ? (
      <Button
        dataTestId={ctaTestId ?? `${dataTestId}-cta`}
        variant="default"
        className="mt-3"
        onClick={onCtaClick}
      >
        {ctaLabel}
      </Button>
    ) : null
  ) : null;

  return (
    <Card className="border-olive-6 bg-olive-2" data-testid={dataTestId}>
      <CardContent className="px-4 py-6">
        <p className="text-sm font-medium text-olive-12">{title}</p>
        <p className="mt-1 text-sm text-olive-11">{description}</p>
        {ctaElement}
      </CardContent>
    </Card>
  );
}

export { EmptyState };
