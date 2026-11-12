import { render, fireEvent, screen } from "@testing-library/react-native";

import IconPicker from "@/app/components/habits/IconPicker";

// jest.setup.js replaces rn-emoji-keyboard with a two-button stub, which is how
// the sheet crashed on React Native 0.88 (it called the removed
// InteractionManager) while every suite stayed green. This file runs the real
// library, so a future upgrade that breaks it fails here.
jest.unmock("rn-emoji-keyboard");
// The category tabs are PNGs, which Jest has no transform for under
// node_modules; they say nothing about whether the sheet opens.
jest.mock("rn-emoji-keyboard/lib/commonjs/components/Icon", () => ({
  Icon: () => null,
}));

describe("IconPicker with the real emoji sheet", () => {
  it("opens the sheet from the + tile without throwing", async () => {
    const onChange = jest.fn();
    await render(<IconPicker value="🏃" onChange={onChange} />);

    await fireEvent.press(screen.getByLabelText("More emoji"));

    expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
