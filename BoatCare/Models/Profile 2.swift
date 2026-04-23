//
//  Profile.swift
//  BoatCare
//
//  Created by Ekkehart Padberg on 27.01.26.
//

import Foundation

struct Profile: Codable, Identifiable {
    let id: UUID
    var username: String?
    var fullName: String?
    var avatarUrl: String?
    var website: String?
    let createdAt: Date?
    var updatedAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case id
        case username
        case fullName = "full_name"
        case avatarUrl = "avatar_url"
        case website
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
