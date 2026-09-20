import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert, AlertButton } from "react-native";

import Profile from "@/app/components/profile/Profile";
import { queryKeys } from "@/lib/queryKeys";
import { ProfileRow } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __router } = require("expo-router") as {
  __router: { push: jest.Mock };
};

function setup(profile: ProfileRow) {
  const qb = makeQueryBuilder({ data: [{ id: "user-1" }], error: null });
  const fromImpl = jest.fn(() => qb);
  // The heatmap on this screen calls `get_heatmap_logs` on mount, so the RPC
  // stub has to answer that too — assertions below filter by name.
  const rpcImpl = jest.fn(() => makeQueryBuilder({ data: [], error: null }));
  const supabase = buildFakeSupabase({ fromImpl, rpcImpl });
  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.profile("user-1"), profile);
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  return { qb, rpcImpl, Wrapper };
}

/** How many times the account-deletion RPC was called, ignoring the heatmap. */
function deleteCalls(rpcImpl: jest.Mock) {
  return rpcImpl.mock.calls.filter((c) => c[0] === "delete_my_account").length;
}

/** Press a button by its label in the most recent `Alert.alert` call. */
function pressAlertButton(label: string) {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const buttons = calls[calls.length - 1][2] as AlertButton[];
  const button = buttons.find((b) => b.text === label);
  if (!button) {
    throw new Error(
      `No "${label}" button. Saw: ${buttons.map((b) => b.text).join(", ")}`,
    );
  }
  button.onPress?.();
}

describe("Profile", () => {
  it("shows the single name column", () => {
    const { Wrapper } = setup({ full_name: "Piotr", avatar_url: null });
    const { getByText } = render(<Profile />, { wrapper: Wrapper });

    expect(getByText("Piotr")).toBeTruthy();
  });

  it("opens the rename modal seeded with the current name", async () => {
    const { Wrapper } = setup({ full_name: "Piotr", avatar_url: null });
    const { getByLabelText, getByPlaceholderText } = render(<Profile />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByLabelText("Change your name"));

    await waitFor(() => {
      expect(getByPlaceholderText("Your name").props.value).toBe("Piotr");
    });
  });

  it("renames through the modal", async () => {
    const { qb, Wrapper } = setup({ full_name: "Piotr", avatar_url: null });
    const { getByLabelText, getByPlaceholderText, getByText } = render(
      <Profile />,
      { wrapper: Wrapper },
    );

    fireEvent.press(getByLabelText("Change your name"));
    fireEvent.changeText(getByPlaceholderText("Your name"), "Zofia");
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(qb.update).toHaveBeenCalledWith({ full_name: "Zofia" });
    });
  });
});

describe("Profile danger zone", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("offers account deletion away from the sign-out control", () => {
    const { Wrapper } = setup({ full_name: "Piotr", avatar_url: null });
    const { getByLabelText } = render(<Profile />, { wrapper: Wrapper });

    expect(getByLabelText("Delete account")).toBeTruthy();
  });

  it("deletes nothing on the first tap", () => {
    const { rpcImpl, Wrapper } = setup({
      full_name: "Piotr",
      avatar_url: null,
    });
    const { getByLabelText } = render(<Profile />, { wrapper: Wrapper });

    fireEvent.press(getByLabelText("Delete account"));

    expect(Alert.alert).toHaveBeenCalled();
    expect(deleteCalls(rpcImpl)).toBe(0);
  });

  it("deletes nothing after only the first confirmation", () => {
    const { rpcImpl, Wrapper } = setup({
      full_name: "Piotr",
      avatar_url: null,
    });
    const { getByLabelText } = render(<Profile />, { wrapper: Wrapper });

    fireEvent.press(getByLabelText("Delete account"));
    pressAlertButton("Delete");

    // The second alert is the point of the two-step: one destructive tap on a
    // screen this easy to reach is too easy to hit by accident.
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    expect(deleteCalls(rpcImpl)).toBe(0);
  });

  it("deletes once both steps are confirmed", async () => {
    const { rpcImpl, Wrapper } = setup({
      full_name: "Piotr",
      avatar_url: null,
    });
    const { getByLabelText } = render(<Profile />, { wrapper: Wrapper });

    fireEvent.press(getByLabelText("Delete account"));
    pressAlertButton("Delete");
    pressAlertButton("Delete forever");

    await waitFor(() => {
      expect(deleteCalls(rpcImpl)).toBe(1);
    });
  });

  it("deletes nothing when the second step is cancelled", () => {
    const { rpcImpl, Wrapper } = setup({
      full_name: "Piotr",
      avatar_url: null,
    });
    const { getByLabelText } = render(<Profile />, { wrapper: Wrapper });

    fireEvent.press(getByLabelText("Delete account"));
    pressAlertButton("Delete");
    pressAlertButton("Cancel");

    expect(deleteCalls(rpcImpl)).toBe(0);
  });
});

describe("Profile header", () => {
  it("opens settings from the gear", () => {
    const { Wrapper } = setup({ full_name: "Piotr", avatar_url: null });
    const { getByLabelText } = render(<Profile />, { wrapper: Wrapper });

    fireEvent.press(getByLabelText("Settings"));

    expect(__router.push).toHaveBeenCalledWith("/notification-settings");
  });

  it("no longer signs out from the header", () => {
    // Sign-out moved onto the settings screen in E3: one settings surface, and
    // the header's only action stops being the one you cannot undo by tapping
    // again.
    const { Wrapper } = setup({ full_name: "Piotr", avatar_url: null });
    const { queryByLabelText } = render(<Profile />, { wrapper: Wrapper });

    expect(queryByLabelText("Log out")).toBeNull();
  });

  it("no longer carries the haptics switch", () => {
    // It lives beside the notification switches now.
    const { Wrapper } = setup({ full_name: "Piotr", avatar_url: null });
    const { queryByLabelText } = render(<Profile />, { wrapper: Wrapper });

    expect(queryByLabelText("Haptics")).toBeNull();
  });
});
