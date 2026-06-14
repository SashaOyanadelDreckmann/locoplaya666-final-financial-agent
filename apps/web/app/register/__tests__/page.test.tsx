import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import RegisterPage from '../page';
import { registerUser } from '@/lib/api/cliente';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/api/cliente', () => ({
  registerUser: jest.fn(),
}));

jest.mock('@/state/session.store', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      setAuthenticated: jest.fn(),
    }),
}));

describe('RegisterPage', () => {
  const mockPush = jest.fn();
  const mockRegisterUser = registerUser as jest.MockedFunction<typeof registerUser>;

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
  });

  it('renders register form', () => {
    render(<RegisterPage />);
    expect(screen.getByText('Crear cuenta')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Cómo prefieres que te llame')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('tu@correo.com')).toBeInTheDocument();
  });

  it('validates all fields are required', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Nombre debe tener al menos 2 caracteres')).toBeInTheDocument();
      expect(screen.getByText('Email requerido')).toBeInTheDocument();
    });
  });

  it('validates name length', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    const nameInput = screen.getByPlaceholderText('Cómo prefieres que te llame');
    await user.type(nameInput, 'A');

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Nombre debe tener al menos 2 caracteres')).toBeInTheDocument();
    });
  });

  it('validates email format', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    const emailInput = screen.getByPlaceholderText('tu@correo.com');
    await user.type(emailInput, 'not-an-email');

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email inválido')).toBeInTheDocument();
    });
  });

  it('validates password strength requirements', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    const passwordInput = screen.getByPlaceholderText('Una clave simple, solo para ti');
    await user.type(passwordInput, 'lowercase');

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Debe contener una mayúscula')).toBeInTheDocument();
    });
  });

  it('submits valid form and navigates to waiting approval', async () => {
    const user = userEvent.setup();
    mockRegisterUser.mockResolvedValue({
      user: { id: '123', name: 'John' },
      approvalStatus: 'PENDING_APPROVAL',
      requiresApproval: true,
    });

    render(<RegisterPage />);

    await user.type(screen.getByPlaceholderText('Cómo prefieres que te llame'), 'John Doe');
    await user.type(screen.getByPlaceholderText('tu@correo.com'), 'john@example.com');
    await user.type(screen.getByPlaceholderText('Una clave simple, solo para ti'), 'Password123');

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockRegisterUser).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123',
      });
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/waiting-approval?')
      );
    });
  });

  it('shows error on registration failure', async () => {
    const user = userEvent.setup();
    mockRegisterUser.mockRejectedValue(new Error('Email already exists'));

    render(<RegisterPage />);

    await user.type(screen.getByPlaceholderText('Cómo prefieres que te llame'), 'John Doe');
    await user.type(screen.getByPlaceholderText('tu@correo.com'), 'john@example.com');
    await user.type(screen.getByPlaceholderText('Una clave simple, solo para ti'), 'Password123');

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Ya existe una cuenta con ese correo.')).toBeInTheDocument();
    });
  });

  it('disables button during submission', async () => {
    const user = userEvent.setup();
    mockRegisterUser.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ user: {} }), 1000))
    );

    render(<RegisterPage />);

    await user.type(screen.getByPlaceholderText('Cómo prefieres que te llame'), 'John Doe');
    await user.type(screen.getByPlaceholderText('tu@correo.com'), 'john@example.com');
    await user.type(screen.getByPlaceholderText('Una clave simple, solo para ti'), 'Password123');

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
  });
});
