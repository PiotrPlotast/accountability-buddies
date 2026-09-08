import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import RenameModal from "@/app/components/profile/RenameModal";
import { MAX_NAME_LENGTH } from "@/lib/displayName";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

function setup(result: { data: unknown; error: { message: string } | null }) {
  const qb = makeQueryBuilder(result);
  const fromImpl = jest.fn(() => qb);
  const supabase = buildFakeSupabase({ fromImpl });
  const { Wrapper } = buildWrapper({
    supabase,
    queryClient: makeQueryClient(),
  });
  return { qb, fromImpl, Wrapper };
}

const ok = { data: [{ id: "user-1" }], error: null };

describe("RenameModal", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it("opens seeded with the current name", () => {
    const { Wrapper } = setup(ok);
    const { getByPlaceholderText } = render(
      <RenameModal isVisible currentName="Piotr" onClose={jest.fn()} />,
      { wrapper: Wrapper },
    );

    expect(getByPlaceholderText("Your name").props.value).toBe("Piotr");
  });

  it("re-seeds when it is reopened after a name change", () => {
    const { Wrapper } = setup(ok);
    const { getByPlaceholderText, rerender } = render(
      <RenameModal isVisible currentName="Piotr" onClose={jest.fn()} />,
      { wrapper: Wrapper },
    );

    fireEvent.changeText(getByPlaceholderText("Your name"), "scratch");
    rerender(
      <RenameModal isVisible={false} currentName="Piotr" onClose={jest.fn()} />,
    );
    rerender(<RenameModal isVisible currentName="Zofia" onClose={jest.fn()} />);

    expect(getByPlaceholderText("Your name").props.value).toBe("Zofia");
  });

  it("caps what can be typed at the maximum length", () => {
    const { Wrapper } = setup(ok);
    const { getByPlaceholderText } = render(
      <RenameModal isVisible currentName="Piotr" onClose={jest.fn()} />,
      { wrapper: Wrapper },
    );

    expect(getByPlaceholderText("Your name").props.maxLength).toBe(
      MAX_NAME_LENGTH,
    );
  });

  it("saves the trimmed name and closes", async () => {
    const { qb, Wrapper } = setup(ok);
    const onClose = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <RenameModal isVisible currentName="Piotr" onClose={onClose} />,
      { wrapper: Wrapper },
    );

    fireEvent.changeText(getByPlaceholderText("Your name"), "  Zofia  ");
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(qb.update).toHaveBeenCalledWith({ full_name: "Zofia" });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("does nothing when the name is unchanged", async () => {
    const { fromImpl, Wrapper } = setup(ok);
    const onClose = jest.fn();
    const { getByText } = render(
      <RenameModal isVisible currentName="Piotr" onClose={onClose} />,
      { wrapper: Wrapper },
    );

    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(fromImpl).not.toHaveBeenCalled();
    });
  });

  it("does not let the name be cleared", async () => {
    const { fromImpl, Wrapper } = setup(ok);
    const { getByPlaceholderText, getByText } = render(
      <RenameModal isVisible currentName="Piotr" onClose={jest.fn()} />,
      { wrapper: Wrapper },
    );

    fireEvent.changeText(getByPlaceholderText("Your name"), "   ");
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(fromImpl).not.toHaveBeenCalled();
    });
  });

  it("stays open when the save fails, so the edit is not lost", async () => {
    const { Wrapper } = setup({ data: null, error: { message: "offline" } });
    const onClose = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <RenameModal isVisible currentName="Piotr" onClose={onClose} />,
      { wrapper: Wrapper },
    );

    fireEvent.changeText(getByPlaceholderText("Your name"), "Zofia");
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels without saving", () => {
    const { fromImpl, Wrapper } = setup(ok);
    const onClose = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <RenameModal isVisible currentName="Piotr" onClose={onClose} />,
      { wrapper: Wrapper },
    );

    fireEvent.changeText(getByPlaceholderText("Your name"), "Zofia");
    fireEvent.press(getByText("Cancel"));

    expect(onClose).toHaveBeenCalled();
    expect(fromImpl).not.toHaveBeenCalled();
  });
});
