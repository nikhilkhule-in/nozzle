import { Container } from "@cloudflare/containers";

export class NozzleContainer extends Container<Env> {
    defaultPort = 8000;
    sleepAfter = "2m";
}
