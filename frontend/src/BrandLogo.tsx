import React from "react";
import { Group, Stack } from "@mantine/core";

type BrandLogoProps = {
  mark: number;
  wordmark?: boolean;
  stack?: boolean;
  wordmarkSize?: number;
};

export function BrandLogo({ mark, wordmark = true, stack = false, wordmarkSize }: BrandLogoProps) {
  const img = (
    <img
      src="/logo-mark.png"
      alt=""
      style={{ display: "block", height: mark, width: "auto", objectFit: "contain" }}
    />
  );
  const wordH = wordmarkSize ?? Math.max(16, Math.round(mark * 0.42));
  const text = wordmark ? (
    <span className="sc-wordmark-slot" style={{ height: wordH }}>
      <img src="/logo-wordmark.png" alt="connect" className="sc-wordmark sc-wordmark--on-light" />
      <img src="/logo-wordmark-light.png" alt="" className="sc-wordmark sc-wordmark--on-dark" />
    </span>
  ) : null;

  if (!wordmark) return img;
  if (stack) {
    return (
      <Stack gap={10} align="center">
        {img}
        {text}
      </Stack>
    );
  }
  return (
    <Group gap={8} wrap="nowrap" align="center">
      {img}
      {text}
    </Group>
  );
}
