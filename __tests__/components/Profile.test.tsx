import { render, fireEvent, waitFor } from "@testing-library/react-native";

import Profile from "@/app/components/profile/Profile";
import { queryKeys } from "@/lib/queryKeys";
import { ProfileRow } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

function setup(profile: ProfileRow) {
  const qb = makeQueryBuilder({ data: [{ id: "user-1" }], error: null });
  const fromImpl = jest.fn(() => qb);
  const supabase = buildFakeSupabase({ fromImpl });
  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.profile("user-1"), profile);
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  return { qb, Wrapper };
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
