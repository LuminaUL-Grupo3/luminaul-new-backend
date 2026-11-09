// Strategy: generación de códigos OTP. Los tests pueden fijar el código.
export abstract class OtpGenerator {
  abstract generate(): string;
}
