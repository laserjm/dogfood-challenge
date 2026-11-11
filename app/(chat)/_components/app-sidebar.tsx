import { Suspense } from "react"
import Link from "next/link"
import { SidebarMenuAction } from "@/components/ui/sidebar"

import * as chats from "@/modules/chats"
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
import { Edit, Plus } from "lucide-react"
import { createChatAction } from "../actions"
import { Button } from "@/components/ui/button"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Label</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href="/" />}>
                  <span>Home</span>
                </SidebarMenuButton>
                <form action={createChatAction}>
                  <SidebarMenuAction type="submit">
                    <Plus />
                    <span className="sr-only">New chat</span>
                  </SidebarMenuAction>
                </form>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <form action={createChatAction}>
                  <Button variant="secondary" type="submit" className="w-full">
                    <Plus className="mr-2" />
                    <span>New Chat</span>
                  </Button>
                </form>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
  const list = await chats.getChats()

  return list.map((chat) => (
    <SidebarMenuItem key={chat.id}>
      <SidebarMenuButton render={<Link href={`/${chat.id}`} />}>
        <span>{chat.title}</span>
      </SidebarMenuButton>
      <SidebarMenuAction showOnHover>
        <Edit /> <span className="sr-only">Edit</span>
      </SidebarMenuAction>
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
