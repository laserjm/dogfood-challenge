import { Suspense } from "react"
import Link from "next/link"

import { getChats } from "@/app/(chat)/_lib/queries"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <Suspense fallback={<ChatListSkeleton />}>
                <ChatList />
              </Suspense>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Other</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href="/" />}>
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>Footer</SidebarFooter>
    </Sidebar>
  )
}

async function ChatList() {
  const chats = await getChats()

  return chats.map((chat) => (
    <SidebarMenuItem key={chat.id}>
      <SidebarMenuButton render={<Link href={`/${chat.id}`} />}>
        <span>{chat.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  ))
}

function ChatListSkeleton() {
  return Array.from({ length: 5 }, (_, i) => (
    <SidebarMenuItem key={i}>
      <SidebarMenuSkeleton />
    </SidebarMenuItem>
  ))
}
