import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import NameScreen from "@/app/(protected)/name";
import { MAX_NAME_LENGTH } from "@/lib/displayName";
import { queryKeys } from "@/lib/queryKeys";
import { ProfileRow } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

// The mocked router instance lives on the expo-router module — see
// jest.setup.js. `require` because it is not part of the real module's
// type surface.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const router = require("expo-router").__router as { replace: jest.Mock };

function setup(result: { data: unknown; error: { message: string } | null }) {
  const qb = makeQueryBuilder(result);
  const fromImpl = jest.fn(() => qb);
  const supabase = buildFakeSupabase({ fromImpl });
  const queryClient = makeQueryClient();
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  return { qb, fromImpl, queryClient, Wrapper };
}

describe("NameScreen", () => {
  beforeEach(() => {
    router.replace.mockClear();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it("starts with an empty field rather than a prefilled guess", () => {
    const { Wrapper } = setup({ data: [{ id: "user-1" }], error: null });
    const { getByPlaceholderText } = render(<NameScreen />, {
      wrapper: Wrapper,
    });

    expect(getByPlaceholderText("Your name").props.value).toBe("");
  });

  it("offers no way to skip", () => {
    const { Wrapper } = setup({ data: [{ id: "user-1" }], error: null });
    const { queryByText } = render(<NameScreen />, { wrapper: Wrapper });

    expect(queryByText(/skip/i)).toBeNull();
  });

  it("does not save an empty or whitespace-only name", async () => {
    const { fromImpl, Wrapper } = setup({
      data: [{ id: "user-1" }],
      error: null,
    });
    const { getByPlaceholderText, getByText } = render(<NameScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByText("Continue"));
    fireEvent.changeText(getByPlaceholderText("Your name"), "   ");
    fireEvent.press(getByText("Continue"));

    await waitFor(() => {
      expect(fromImpl).not.toHaveBeenCalled();
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("caps what can be typed at the maximum length", () => {
    const { Wrapper } = setup({ data: [{ id: "user-1" }], error: null });
    const { getByPlaceholderText } = render(<NameScreen />, {
      wrapper: Wrapper,
    });

    expect(getByPlaceholderText("Your name").props.maxLength).toBe(
      MAX_NAME_LENGTH,
    );
  });

  it("saves the trimmed name and hands the user to the dashboard", async () => {
    const { qb, Wrapper } = setup({ data: [{ id: "user-1" }], error: null });
    const { getByPlaceholderText, getByText } = render(<NameScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.changeText(getByPlaceholderText("Your name"), "  Zofia  ");
    fireEvent.press(getByText("Continue"));

    await waitFor(() => {
      expect(qb.update).toHaveBeenCalledWith({ full_name: "Zofia" });
    });
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/");
    });
  });

  it("keeps the user on the screen when the save fails", async () => {
    const { Wrapper } = setup({ data: null, error: { message: "offline" } });
    const { getByPlaceholderText, getByText } = render(<NameScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.changeText(getByPlaceholderText("Your name"), "Zofia");
    fireEvent.press(getByText("Continue"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("leaves the name in the profile cache for the gate to see", async () => {
    const { queryClient, Wrapper } = setup({
      data: [{ id: "user-1" }],
      error: null,
    });
    const { getByPlaceholderText, getByText } = render(<NameScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.changeText(getByPlaceholderText("Your name"), "Zofia");
    fireEvent.press(getByText("Continue"));

    await waitFor(() => {
      expect(
        queryClient.getQueryData<ProfileRow>(queryKeys.profile("user-1"))
          ?.full_name,
      ).toBe("Zofia");
    });
  });
});
