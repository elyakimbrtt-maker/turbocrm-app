import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const get = vi.fn();
const info = vi.fn();
Object.defineProperty(window, "location", { value: { assign: push }, writable: true });
vi.mock("@/lib/api/client", () => ({ apiClient: { get: (...a: unknown[]) => get(...a) } }));
vi.mock("sonner", () => ({ toast: { info: (...a: unknown[]) => info(...a), error: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

import { AbrirNoFunilNaConversa } from "./AbrirNoFunilNaConversa";

describe("AbrirNoFunilNaConversa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("leva ao card do cliente no quadro do funil", async () => {
    get.mockResolvedValue({ data: { leads: [{ id: "L1", pipeline_id: "P1" }] } });
    render(<AbrirNoFunilNaConversa contactId="C1" />);
    fireEvent.click(screen.getByTestId("conversa-abrir-no-funil"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/pipelines/P1?lead=L1"));
    expect(get).toHaveBeenCalledWith("/api/v1/contacts/C1/crm-summary");
  });

  it("sem card, avisa e não navega", async () => {
    get.mockResolvedValue({ data: { leads: [] } });
    render(<AbrirNoFunilNaConversa contactId="C1" />);
    fireEvent.click(screen.getByTestId("conversa-abrir-no-funil"));
    await waitFor(() => expect(info).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });
});
