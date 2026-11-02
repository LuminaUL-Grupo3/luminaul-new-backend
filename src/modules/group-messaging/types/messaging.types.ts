export type GroupRole = "leader" | "member";
export type MemberStatus = "active" | "left" | "kicked";
export type RequestStatus = "pending" | "approved" | "rejected";
export type MessageStatus = "published" | "hidden" | "deleted";
export const REACTION_EMOJIS = ["❤️", "😂", "👍", "🔥"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface ChatIdentity {
  id: string;
  name: string;
  expiresAt: number;
}
export interface GroupMemberDto {
  userId: string;
  name: string;
  role: GroupRole;
  status: MemberStatus;
  profilePhotoUrl: string | null;
  joinedAt: string;
}
export interface GroupDetailDto {
  id: string;
  name: string;
  description: string | null;
  courseCode: string;
  leaderId: string;
  meetingMode: "presencial" | "virtual" | "hibrido";
  meetingShift: "manana" | "tarde" | "noche";
  maxCapacity: number;
  currentMembers: number;
  leader: { id: string; name: string; profilePhotoUrl: string | null };
  myRole: GroupRole | null;
  myStatus: MemberStatus | "none";
  createdAt: string;
  pendingRequest: boolean;
  benefits: string | null;
  requirements: string | null;
  lastMessage: string | null;
  lastActivity: string;
  unreadCount: number;
  // Alias de lectura para el feed actual; el rol canónico del grupo siempre es leader/member.
  my_status: GroupRole | "pending" | "none";
}
export interface JoinRequestDto {
  id: string;
  groupId: string;
  userId: string;
  groupName: string;
  status: RequestStatus;
  message: string | null;
  createdAt: string;
  applicant: {
    id: string;
    name: string;
    email: string;
    profilePhotoUrl: string | null;
  };
}
export interface ReactionDto {
  emoji: ReactionEmoji;
  userIds: string[];
}
export interface ReadReceiptDto {
  userId: string;
  name: string;
}
export interface MessageReplyDto {
  id: string;
  senderName: string;
  content: string | null;
  status: MessageStatus;
}
export interface GroupMessageDto {
  id: string;
  groupId: string;
  senderId: string;
  content: string;
  status: MessageStatus;
  createdAt: string;
  sender: { id: string; name: string; profilePhotoUrl: string | null };
  clientMessageId: string | null;
  replyTo: MessageReplyDto | null;
  reactions: ReactionDto[];
  readBy: ReadReceiptDto[];
}
export interface ChatError {
  message: string;
  code: string;
}
export type WsAck<T = Record<string, never>> =
  | ({ success: true } & T)
  | { success: false; error: ChatError };
export interface MembershipRemovedEvent {
  groupId: string;
  userId: string;
}
export interface HiddenMessageEvent {
  groupId: string;
  messageId: string;
}
export interface TypingEvent {
  groupId: string;
  userId: string;
  name: string;
  isTyping: boolean;
}
export interface PresenceEvent {
  groupId: string;
  userIds: string[];
}
